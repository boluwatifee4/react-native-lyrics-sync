import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  FlatList,
  ScrollView,
  Alert,
  Animated,
  Image,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { usePlayerStore } from '../../player/store/usePlayerStore';
import { saveTrackLyrics } from '../../../services/db';
import {
  SyncHistoryState,
  createInitialHistory,
  markLineBoundary,
  markWordBoundary,
  finishLastLine,
  finishLastWord,
  shiftLineTimestamp,
  shiftWordTimestamp,
  undoSyncAction,
  resetAllTimestamps,
} from '../../../domain/timelineEngine';
import { LyricLine } from '../../../domain/lyrics';
import { AudioWaveform } from '../../synchronization/components/AudioWaveform';
import { ImportTrackModal } from './ImportTrackModal';
import { TrackLibraryModal } from '../../player/components/TrackLibraryModal';
import { FineTuneScreen } from './FineTuneScreen';
import { exportLyricsAsLrc } from '../services/lrcExporter';
import { Colors } from '../../../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type LineState = 'synced' | 'active' | 'waiting';

function formatPreciseMs(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSec = Math.floor(safeMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const millis = Math.floor((safeMs % 1000) / 10).toString().padStart(2, '0');
  return `${min}:${sec.toString().padStart(2, '0')}.${millis}`;
}

function getLineState(
  index: number,
  activeIndex: number,
  line: LyricLine,
  isLineSynced: (line: LyricLine) => boolean
): LineState {
  if (index < activeIndex && isLineSynced(line)) return 'synced';
  if (index === activeIndex) return 'active';
  return 'waiting';
}

interface SyncTableRowProps {
  item: LyricLine;
  index: number;
  state: LineState;
  isCurrentActive: boolean;
  onSelectLine: (index: number) => void;
}

const SyncTableRow = React.memo(function SyncTableRow({
  item,
  index,
  state,
  isCurrentActive,
  onSelectLine,
}: SyncTableRowProps) {
  return (
    <TouchableOpacity
      style={[
        styles.tableRow,
        state === 'active' && styles.tableRowActive,
        state === 'synced' && styles.tableRowSynced,
      ]}
      onPress={() => onSelectLine(index)}
      activeOpacity={0.7}
    >
      {/* Telemetry status dot & index */}
      <View style={styles.rowTelemetryCol}>
        <Text style={[styles.rowLineNum, isCurrentActive && styles.rowLineNumActive]}>
          {(index + 1).toString().padStart(2, '0')}
        </Text>
        <View
          style={[
            styles.rowDot,
            state === 'synced' && styles.rowDotSynced,
            state === 'active' && styles.rowDotActive,
            state === 'waiting' && styles.rowDotWaiting,
          ]}
        />
      </View>

      {/* Line text & timecode readout */}
      <View style={styles.rowTextCol}>
        <Text
          style={[
            styles.lineText,
            state === 'active' && styles.lineTextActive,
            state === 'synced' && styles.lineTextSynced,
            state === 'waiting' && styles.lineTextWaiting,
          ]}
          numberOfLines={2}
        >
          {item.text}
        </Text>
        {state === 'synced' && item.startMs > 0 && (
          <Text style={styles.lineTimecode}>
            {formatPreciseMs(item.startMs)} ➔ {formatPreciseMs(item.endMs)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

function useFlashAnim() {
  const flashOpacity = useRef(new Animated.Value(0)).current;

  const triggerFlash = useCallback(() => {
    flashOpacity.setValue(1);
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [flashOpacity]);

  return { flashOpacity, triggerFlash };
}

const DEFAULT_AUDIO_URI = Image.resolveAssetSource(
  require('../../../../assets/audio/Johnny-Drille-How-Are-You-My-Friend-Vistanaij.com_.mp3')
).uri;

export const SyncEditorView: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const activeTrack = usePlayerStore((s) => s.activeTrack);
  const lyrics = usePlayerStore((s) => s.lyrics);
  const setPositionMs = usePlayerStore((s) => s.setPositionMs);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);

  const [mode, setMode] = useState<'line' | 'word'>('line');
  const [isFineTuneOpen, setIsFineTuneOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  const audioUri = activeTrack?.audioUri || DEFAULT_AUDIO_URI;
  const player = useAudioPlayer(audioUri, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  const currentMs = Math.floor((status.currentTime || 0) * 1000);
  const totalMs = Math.floor((status.duration || 0) * 1000) || activeTrack?.durationMs || 1;

  // History State Machine
  const [history, setHistory] = useState<SyncHistoryState>(() => createInitialHistory(lyrics));
  const [activeLineIndex, setActiveLineIndex] = useState<number>(0);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number>(0);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(0);

  const { flashOpacity, triggerFlash } = useFlashAnim();
  const listRef = useRef<FlatList>(null);
  const appliedTrackIdRef = useRef<string | undefined>(undefined);
  const theme = Colors.dark;

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

  useEffect(() => {
    if (appliedTrackIdRef.current === activeTrack?.id) return;
    appliedTrackIdRef.current = activeTrack?.id;
    setHistory(createInitialHistory(lyrics));
    setActiveLineIndex(0);
    setSelectedLineIndex(0);
    setActiveWordIndex(0);
    setMode('line');
  }, [activeTrack?.id]);

  const currentLines = history.present;
  const isLineSynced = (line: LyricLine): boolean => {
    if (mode === 'word' && line.words.length > 0) {
      return line.startMs > 0 && line.words.every((w) => w.startMs > 0);
    }
    return line.startMs > 0;
  };
  const allSynced = currentLines.length > 0 && currentLines.every(isLineSynced);
  const syncedCount = currentLines.filter(isLineSynced).length;

  const activeIdx = clamp(mode === 'word' ? selectedLineIndex : activeLineIndex, 0, Math.max(currentLines.length - 1, 0));
  const selectedLine = currentLines[activeIdx];
  const activeWordIdx = selectedLine ? clamp(activeWordIndex, 0, Math.max(selectedLine.words.length - 1, 0)) : 0;
  const activeWord = selectedLine?.words[activeWordIdx];

  const switchToWordMode = useCallback(() => {
    setMode('word');
    const li = clamp(activeLineIndex, 0, Math.max(currentLines.length - 1, 0));
    setSelectedLineIndex(li);
    setActiveWordIndex(0);
  }, [activeLineIndex, currentLines]);

  const switchToLineMode = useCallback(() => {
    setMode('line');
    setActiveLineIndex(selectedLineIndex);
  }, [selectedLineIndex]);

  const handleLineMark = useCallback(() => {
    if (currentLines.length === 0) return;

    const idx = clamp(activeLineIndex, 0, currentLines.length - 1);
    const result = markLineBoundary(history, idx, currentMs);
    let nextHistory = result.history;

    if (idx === currentLines.length - 1) {
      nextHistory = finishLastLine(nextHistory, idx, totalMs);
    }

    setHistory(nextHistory);
    usePlayerStore.setState({ lyrics: nextHistory.present });

    // Advance sequentially to the next line
    const nextActive = Math.min(idx + 1, currentLines.length - 1);
    setActiveLineIndex(nextActive);
    setSelectedLineIndex(nextActive);

    triggerFlash();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (idx + 1 < currentLines.length) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: idx + 1,
          animated: true,
          viewPosition: 0.35,
        });
      }, 50);
    }
  }, [history, activeLineIndex, currentMs, currentLines, totalMs, triggerFlash]);

  const handleWordMark = useCallback(() => {
    if (currentLines.length === 0) return;

    const li = clamp(selectedLineIndex, 0, currentLines.length - 1);
    const line = currentLines[li];
    if (!line || line.words.length === 0) return;
    const wi = clamp(activeWordIndex, 0, line.words.length - 1);

    const result = markWordBoundary(history, li, wi, currentMs);
    let nextHistory = result.history;

    const isLastWord = wi === line.words.length - 1;
    const isLastLine = li === currentLines.length - 1;
    if (isLastWord && isLastLine) {
      nextHistory = finishLastWord(nextHistory, li, wi, totalMs);
    }

    setHistory(nextHistory);
    usePlayerStore.setState({ lyrics: nextHistory.present });

    triggerFlash();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (wi + 1 < line.words.length) {
      // Move to next word in this line
      setActiveWordIndex(wi + 1);
    } else if (li + 1 < currentLines.length) {
      // Completed line words, advance cleanly to next line without looking back
      const nextLineIdx = li + 1;
      setSelectedLineIndex(nextLineIdx);
      setActiveLineIndex(nextLineIdx);
      setActiveWordIndex(0);
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: nextLineIdx,
          animated: true,
          viewPosition: 0.35,
        });
      }, 50);
    }
  }, [history, selectedLineIndex, activeWordIndex, currentMs, currentLines, totalMs, triggerFlash]);

  const handleUndo = useCallback(async () => {
    if (history.past.length === 0) return;

    const wasPlaying = status.playing;
    if (wasPlaying) {
      try {
        player.pause();
      } catch (e) {}
    }

    const nextHistory = undoSyncAction(history);
    setHistory(nextHistory);
    usePlayerStore.setState({ lyrics: nextHistory.present });

    if (mode === 'word') {
      if (activeWordIndex > 0) {
        setActiveWordIndex(activeWordIndex - 1);
      } else if (selectedLineIndex > 0) {
        const prevLineIdx = selectedLineIndex - 1;
        setSelectedLineIndex(prevLineIdx);
        setActiveLineIndex(prevLineIdx);
        const prevWords = nextHistory.present[prevLineIdx]?.words || [];
        setActiveWordIndex(Math.max(0, prevWords.length - 1));
      }
    } else {
      if (activeLineIndex > 0) {
        const prevLineIdx = activeLineIndex - 1;
        setActiveLineIndex(prevLineIdx);
        setSelectedLineIndex(prevLineIdx);
      }
    }

    const rewindTarget = Math.max(0, currentMs - 2500);
    setPositionMs(rewindTarget);
    try {
      player.seekTo(rewindTarget / 1000);
    } catch (e) {}

    if (wasPlaying) {
      setTimeout(() => {
        try {
          player.play();
        } catch (e) {}
      }, 80);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [history, currentMs, mode, activeWordIndex, selectedLineIndex, activeLineIndex, player, setPositionMs, status.playing]);

  const performReset = useCallback(() => {
    const nextHistory = resetAllTimestamps(history);
    setHistory(nextHistory);
    setActiveLineIndex(0);
    setSelectedLineIndex(0);
    setActiveWordIndex(0);
    usePlayerStore.setState({ lyrics: nextHistory.present });
    try {
      player.pause();
      player.seekTo(0);
    } catch (e) {}
    setPositionMs(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    showToast('All timestamps reset ✓');
  }, [history, player, setPositionMs, showToast]);

  const handleStartOver = useCallback(() => {
    Alert.alert(
      'RESET ALL TIMESTAMPS',
      'Clear all synchronization timestamps for this track?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset All',
          style: 'destructive',
          onPress: performReset,
        },
      ]
    );
  }, [performReset]);

  const handleSave = useCallback(async () => {
    if (!activeTrack) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    showToast('Saved to storage ✓');
    try {
      await saveTrackLyrics(activeTrack.id, currentLines);
    } catch (e: any) {
      showToast('Save failed: ' + e.message);
    }
  }, [activeTrack, currentLines, showToast]);

  const handleShift = useCallback((deltaMs: number) => {
    if (currentLines.length === 0) return;
    const li = clamp(mode === 'word' ? selectedLineIndex : activeLineIndex, 0, currentLines.length - 1);
    const nextHistory = shiftLineTimestamp(history, li, deltaMs);
    setHistory(nextHistory);
    usePlayerStore.setState({ lyrics: nextHistory.present });
    Haptics.selectionAsync().catch(() => {});
  }, [history, mode, selectedLineIndex, activeLineIndex, currentLines.length]);

  const handleNudgeLine = useCallback((lineIndex: number, deltaMs: number) => {
    const nextHistory = shiftLineTimestamp(history, lineIndex, deltaMs);
    setHistory(nextHistory);
    usePlayerStore.setState({ lyrics: nextHistory.present });
    Haptics.selectionAsync().catch(() => {});
  }, [history]);

  const handleNudgeWord = useCallback((lineIndex: number, wordIndex: number, deltaMs: number) => {
    const nextHistory = shiftWordTimestamp(history, lineIndex, wordIndex, deltaMs);
    setHistory(nextHistory);
    usePlayerStore.setState({ lyrics: nextHistory.present });
    Haptics.selectionAsync().catch(() => {});
  }, [history]);

  const handleRestorePlayback = useCallback((targetMs: number) => {
    try {
      player.pause();
      setPositionMs(targetMs);
      player.seekTo(targetMs / 1000);
      setTimeout(() => {
        try {
          player.play();
        } catch (e) {}
      }, 60);
    } catch (e) {}
  }, [player, setPositionMs]);

  const handleExportLrc = useCallback(async () => {
    if (!activeTrack) return;
    try {
      await exportLyricsAsLrc(currentLines, activeTrack.title);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert('Export Failed', e.message || 'Could not export .lrc');
    }
  }, [activeTrack, currentLines]);

  const togglePlayPause = () => {
    try {
      if (status.playing) {
        player.pause();
      } else {
        player.play();
      }
    } catch (e) {
      console.warn('Sync togglePlayPause error:', e);
    }
  };

  const handleSeek = (offsetMs: number) => {
    try {
      const target = Math.max(0, Math.min(totalMs, currentMs + offsetMs));
      player.seekTo(target / 1000);
      setPositionMs(target);
    } catch (e) {}
  };

  const formatPreciseMs = (ms: number) => {
    const safeMs = Math.max(0, ms);
    const totalSec = Math.floor(safeMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const millis = Math.floor((safeMs % 1000) / 10).toString().padStart(2, '0');
    return `${min}:${sec.toString().padStart(2, '0')}.${millis}`;
  };

  const nextLineText = allSynced ? null : currentLines[activeIdx]?.text || '';
  const nextWordText = allSynced ? null : activeWord?.text || '';
  const wordModeDisabled = mode === 'word' && (!selectedLine || selectedLine.words.length === 0);

  return (
    <View style={styles.container}>
      {/* ─── TELEMETRY HEADER ─── */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={8}
          activeOpacity={0.65}
        >
          <Ionicons
            name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
            size={20}
            color={Colors.dark.textPrimary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.trackDetails}
          onPress={() => setIsLibraryModalOpen(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.headerLabel}>MISSION // SYNC TELEMETRY</Text>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {activeTrack?.title || 'No Track Selected'}
          </Text>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => setIsLibraryModalOpen(true)}
            hitSlop={8}
          >
            <Ionicons name="albums-outline" size={16} color="#A1A1AA" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerIconBtn, styles.headerIconBtnAccent]}
            onPress={() => setIsImportModalOpen(true)}
            hitSlop={8}
          >
            <Ionicons name="add" size={18} color="#3E9BFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── STATUS READOUT & MODE BAR ─── */}
      <View style={styles.statusReadoutBar}>
        <View style={styles.syncStatsGroup}>
          <Text style={styles.syncStatsLabel}>
            {allSynced
              ? 'STATUS // FULLY SYNCHRONIZED'
              : `SYNC // ${syncedCount} OF ${currentLines.length} LINES`}
          </Text>
          <View style={styles.syncProgressGauge}>
            <View
              style={[
                styles.syncProgressFill,
                { width: `${(syncedCount / Math.max(1, currentLines.length)) * 100}%` },
                allSynced && { backgroundColor: '#30D158' },
              ]}
            />
          </View>
        </View>

        {/* Prominent Mode Selector */}
        <View style={styles.modeSegment}>
          <TouchableOpacity
            style={[styles.modeSegmentBtn, mode === 'line' && styles.modeSegmentActive]}
            onPress={switchToLineMode}
            hitSlop={6}
            activeOpacity={0.7}
          >
            <Ionicons
              name="reorder-two-outline"
              size={16}
              color={mode === 'line' ? '#FFFFFF' : '#71717A'}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.modeSegmentText, mode === 'line' && styles.modeSegmentTextActive]}>
              LINE
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeSegmentBtn, mode === 'word' && styles.modeSegmentActive]}
            onPress={switchToWordMode}
            hitSlop={6}
            activeOpacity={0.7}
          >
            <Ionicons
              name="text-outline"
              size={15}
              color={mode === 'word' ? '#FFFFFF' : '#71717A'}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.modeSegmentText, mode === 'word' && styles.modeSegmentTextActive]}>
              WORD
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── ACOUSTIC WAVEFORM TIMELINE ─── */}
      <AudioWaveform
        positionMs={currentMs}
        durationMs={totalMs}
        onSeekRequested={(ms) => {
          player.seekTo(ms / 1000);
          setPositionMs(ms);
        }}
      />

      {/* ─── FLASH OVERLAY (Subtle precision trigger) ─── */}
      <Animated.View
        pointerEvents="none"
        style={[styles.flashOverlay, { opacity: flashOpacity }]}
      />

      {/* ─── TELEMETRY LYRIC TABLE ─── */}
      <FlatList
        ref={listRef}
        data={currentLines}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onScrollToIndexFailed={() => {}}
        renderItem={({ item, index }) => (
          <SyncTableRow
            item={item}
            index={index}
            state={getLineState(index, activeIdx, item, isLineSynced)}
            isCurrentActive={index === activeIdx}
            onSelectLine={(idx) => {
              setActiveLineIndex(idx);
              setSelectedLineIndex(idx);
              setActiveWordIndex(0);
            }}
          />
        )}
        initialNumToRender={14}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      {/* ─── COCKPIT ACTUATION & TRANSPORT FOOTER ─── */}
      <View style={styles.cockpitFooter}>
        {/* Word Telemetry Sequencer (Word Mode only) */}
        {mode === 'word' && selectedLine && selectedLine.words.length > 0 && (
          <View style={styles.wordRibbonContainer}>
            <Text style={styles.wordRibbonLabel}>
              WORD SEQUENCER // LINE {(activeIdx + 1).toString().padStart(2, '0')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.wordRibbon}
            >
              {selectedLine.words.map((word, wi) => {
                const chipState =
                  wi < activeWordIdx || (wi === activeWordIdx && word.startMs > 0)
                    ? 'synced'
                    : wi === activeWordIdx
                    ? 'active'
                    : 'waiting';

                return (
                  <TouchableOpacity
                    key={word.id}
                    style={[
                      styles.wordChip,
                      chipState === 'active' && styles.wordChipActive,
                      chipState === 'synced' && styles.wordChipSynced,
                    ]}
                    onPress={() => setActiveWordIndex(wi)}
                  >
                    <Text
                      style={[
                        styles.wordChipText,
                        chipState === 'active' && styles.wordChipTextActive,
                        chipState === 'synced' && styles.wordChipTextSynced,
                      ]}
                    >
                      {word.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Secondary controls strip: Transport & Steppers */}
        <View style={styles.controlStrip}>
          <View style={styles.transportGroup}>
            <TouchableOpacity style={styles.transportBtn} onPress={() => handleSeek(-5000)} hitSlop={8}>
              <Ionicons name="play-back" size={16} color="#71717A" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.playBtn} onPress={togglePlayPause} hitSlop={6}>
              <Ionicons
                name={status.playing ? 'pause' : 'play'}
                size={16}
                color={theme.accent}
                style={{ marginLeft: status.playing ? 0 : 2 }}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.transportBtn} onPress={() => handleSeek(5000)} hitSlop={8}>
              <Ionicons name="play-forward" size={16} color="#71717A" />
            </TouchableOpacity>
          </View>

          {/* Stepper adjustment controls */}
          <View style={styles.stepperGroup}>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => handleShift(-100)}>
              <Text style={styles.stepperText}>-100</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => handleShift(-10)}>
              <Text style={styles.stepperText}>-10</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => handleShift(10)}>
              <Text style={styles.stepperText}>+10</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => handleShift(100)}>
              <Text style={styles.stepperText}>+100</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.undoBtn, history.past.length === 0 && styles.btnDisabled]}
            disabled={history.past.length === 0}
            onPress={handleUndo}
            hitSlop={6}
          >
            <Ionicons name="arrow-undo" size={14} color="#A1A1AA" />
            <Text style={styles.undoText}>UNDO</Text>
          </TouchableOpacity>
        </View>

        {/* ─── PRIMARY SYNC ACTUATOR BUTTON ─── */}
        {allSynced ? (
          <View style={styles.completeCard}>
            <View style={styles.completeHeader}>
              <Text style={styles.completeTitle}>ALL LINES SYNCHRONIZED</Text>
              <Text style={styles.completeSub}>Ready for verification and storage</Text>
            </View>
            <View style={styles.completeActions}>
              <TouchableOpacity style={styles.completeBtn} onPress={handleSave}>
                <Ionicons name="save-outline" size={14} color="#000000" />
                <Text style={styles.completeBtnText}>SAVE SYNC</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.completeSecondaryBtn} onPress={() => setIsFineTuneOpen(true)}>
                <Text style={styles.completeSecondaryText}>FINE TUNE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.completeSecondaryBtn} onPress={handleExportLrc}>
                <Text style={styles.completeSecondaryText}>EXPORT .LRC</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : mode === 'word' && wordModeDisabled ? (
          <View style={[styles.markActuator, styles.markActuatorDisabled]}>
            <Text style={styles.actuatorDisabledLabel}>NO WORD TIMESTAMPS DETECTED</Text>
            <Text style={styles.actuatorDisabledSub}>Switch to Line Mode or re-import</Text>
          </View>
        ) : mode === 'word' ? (
          <Pressable
            style={({ pressed }) => [
              styles.markActuator,
              pressed && styles.markActuatorPressed,
            ]}
            onPressIn={handleWordMark}
            hitSlop={8}
          >
            <View style={styles.actuatorTelemetryRow}>
              <Text style={styles.actuatorCue}>TAP TO CAPTURE WORD</Text>
              {selectedLine && (
                <Text style={styles.actuatorIndex}>
                  W {(activeWordIdx + 1).toString().padStart(2, '0')}/
                  {(selectedLine.words.length).toString().padStart(2, '0')}
                </Text>
              )}
            </View>
            <Text style={styles.actuatorTargetText} numberOfLines={1}>
              {nextWordText}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.markActuator,
              pressed && styles.markActuatorPressed,
            ]}
            onPressIn={handleLineMark}
            hitSlop={8}
          >
            <View style={styles.actuatorTelemetryRow}>
              <Text style={styles.actuatorCue}>TAP TO CAPTURE LINE</Text>
              <Text style={styles.actuatorIndex}>
                L {(activeIdx + 1).toString().padStart(2, '0')}/
                {(currentLines.length).toString().padStart(2, '0')}
              </Text>
            </View>
            <Text style={styles.actuatorTargetText} numberOfLines={2}>
              {nextLineText}
            </Text>
          </Pressable>
        )}

        {/* Modern Utility Bottom Action Bar */}
        <View style={styles.utilityBar}>
          <TouchableOpacity
            style={styles.utilityResetBtn}
            onPress={handleStartOver}
            hitSlop={6}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={15} color="#FF453A" style={{ marginRight: 6 }} />
            <Text style={styles.utilityResetText}>RESET ALL</Text>
          </TouchableOpacity>

          <View style={styles.utilityRightGroup}>
            <TouchableOpacity
              style={styles.utilityFineTuneBtn}
              onPress={() => setIsFineTuneOpen(true)}
              hitSlop={6}
              activeOpacity={0.7}
            >
              <Ionicons name="options-outline" size={15} color="#D4D4D8" style={{ marginRight: 6 }} />
              <Text style={styles.utilityText}>FINE TUNE</Text>
            </TouchableOpacity>

            {!allSynced && (
              <TouchableOpacity
                style={styles.utilitySaveBtn}
                onPress={handleSave}
                hitSlop={6}
                activeOpacity={0.7}
              >
                <Ionicons name="cloud-upload-outline" size={15} color="#000000" style={{ marginRight: 6 }} />
                <Text style={styles.utilitySaveText}>SAVE DRAFT</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* ─── FLOATING TOAST BADGE ─── */}
      {toastMessage && (
        <View style={[styles.toastContainer, { top: Math.max(insets.top + 50, 60) }]}>
          <Ionicons name="checkmark-circle" size={16} color="#30D158" style={{ marginRight: 6 }} />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* ─── MODALS ─── */}
      <ImportTrackModal
        visible={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
      <TrackLibraryModal
        visible={isLibraryModalOpen}
        onClose={() => setIsLibraryModalOpen(false)}
        onOpenImport={() => setIsImportModalOpen(true)}
      />
      <FineTuneScreen
        visible={isFineTuneOpen}
        onClose={() => setIsFineTuneOpen(false)}
        lines={currentLines}
        currentMs={currentMs}
        isPlaying={status.playing}
        onPlayPause={togglePlayPause}
        onSeek={handleRestorePlayback}
        onNudgeLine={handleNudgeLine}
        onNudgeWord={handleNudgeWord}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: Colors.dark.hairlineActive,
    backgroundColor: Colors.dark.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  trackDetails: {
    flex: 1,
  },
  headerLabel: {
    color: '#52525B',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  trackTitle: {
    color: '#F4F4F5',
    fontSize: 15,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 2,
    backgroundColor: '#08080A',
    borderWidth: 1,
    borderColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtnAccent: {
    borderColor: '#3E9BFF',
    backgroundColor: 'transparent',
  },
  statusReadoutBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
    backgroundColor: '#050507',
  },
  syncStatsGroup: {
    flex: 1,
    marginRight: 16,
  },
  syncStatsLabel: {
    color: '#71717A',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  syncProgressGauge: {
    height: 3,
    backgroundColor: '#18181B',
    borderRadius: 2,
    overflow: 'hidden',
  },
  syncProgressFill: {
    height: '100%',
    backgroundColor: '#3E9BFF',
    borderRadius: 2,
  },
  modeSegment: {
    flexDirection: 'row',
    backgroundColor: '#121217',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 8,
    padding: 3,
  },
  modeSegmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  modeSegmentActive: {
    backgroundColor: '#272732',
    borderWidth: 1,
    borderColor: '#3E9BFF',
  },
  modeSegmentText: {
    color: '#71717A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  modeSegmentTextActive: {
    color: '#FFFFFF',
  },
  flashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(62, 155, 255, 0.12)',
    zIndex: 10,
  },
  list: {
    paddingVertical: 6,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#101014',
  },
  tableRowActive: {
    backgroundColor: '#08080E',
  },
  tableRowSynced: {},
  rowTelemetryCol: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 38,
    gap: 6,
  },
  rowLineNum: {
    color: '#3F3F46',
    fontSize: 10,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  rowLineNumActive: {
    color: '#3E9BFF',
  },
  rowDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  rowDotSynced: {
    backgroundColor: '#30D158',
  },
  rowDotActive: {
    backgroundColor: '#3E9BFF',
  },
  rowDotWaiting: {
    backgroundColor: '#5A6270',
  },
  rowTextCol: {
    flex: 1,
  },
  lineText: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  lineTextActive: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  lineTextSynced: {
    color: '#A1A1AA',
  },
  lineTextWaiting: {
    color: '#8B93A3',
  },
  lineTimecode: {
    color: '#52525B',
    fontSize: 10,
    fontWeight: '400',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  cockpitFooter: {
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#18181B',
  },
  wordRibbonContainer: {
    marginBottom: 8,
  },
  wordRibbonLabel: {
    color: '#52525B',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  wordRibbon: {
    gap: 6,
    paddingRight: 20,
  },
  wordChip: {
    backgroundColor: '#08080A',
    borderWidth: 1,
    borderColor: '#18181B',
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  wordChipActive: {
    borderColor: '#3E9BFF',
    backgroundColor: '#0A0A12',
  },
  wordChipSynced: {
    borderColor: '#18181B',
  },
  wordChipText: {
    color: '#52525B',
    fontSize: 11,
    fontWeight: '500',
  },
  wordChipTextActive: {
    color: '#3E9BFF',
    fontWeight: '600',
  },
  wordChipTextSynced: {
    color: '#30D158',
  },
  controlStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  transportGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  transportBtn: {
    padding: 6,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#08080A',
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  stepperBtn: {
    backgroundColor: '#08080A',
    borderWidth: 1,
    borderColor: '#18181B',
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  stepperText: {
    color: '#A1A1AA',
    fontSize: 10,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
  },
  undoText: {
    color: '#A1A1AA',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  btnDisabled: {
    opacity: 0.3,
  },
  markActuator: {
    backgroundColor: '#0A0A10',
    borderWidth: 1,
    borderColor: '#3E9BFF',
    borderRadius: 2,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  markActuatorPressed: {
    backgroundColor: '#121220',
    borderColor: '#60A5FA',
    transform: [{ scale: 0.99 }],
  },
  actuatorTelemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  actuatorCue: {
    color: '#3E9BFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  actuatorIndex: {
    color: '#52525B',
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  actuatorTargetText: {
    color: '#F4F4F5',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  markActuatorDisabled: {
    borderColor: '#18181B',
    backgroundColor: '#08080A',
  },
  actuatorDisabledLabel: {
    color: '#52525B',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  actuatorDisabledSub: {
    color: '#3F3F46',
    fontSize: 12,
    marginTop: 2,
  },
  completeCard: {
    backgroundColor: '#08080A',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 2,
    padding: 14,
    marginBottom: 8,
  },
  completeHeader: {
    marginBottom: 10,
  },
  completeTitle: {
    color: '#30D158',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  completeSub: {
    color: '#71717A',
    fontSize: 11,
    marginTop: 2,
  },
  completeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#30D158',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 2,
    gap: 4,
  },
  completeBtnText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  completeSecondaryBtn: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeSecondaryText: {
    color: '#F4F4F5',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  utilityBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
  },
  utilityResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1314',
    borderWidth: 1,
    borderColor: '#381E20',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  utilityResetText: {
    color: '#FF453A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  utilityRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  utilityFineTuneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  utilitySaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#30D158',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  utilityText: {
    color: '#E4E4E7',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  utilitySaveText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  toastContainer: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#30D158',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 999,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
