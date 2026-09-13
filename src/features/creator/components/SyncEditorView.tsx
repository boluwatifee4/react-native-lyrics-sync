import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
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

// ─── Line State Enum ───────────────────────────────────────────
type LineState = 'synced' | 'active' | 'waiting';

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

// ─── Flash Animation Hook ──────────────────────────────────────
function useFlashAnim() {
  const flashOpacity = useRef(new Animated.Value(0)).current;

  const triggerFlash = useCallback(() => {
    flashOpacity.setValue(1);
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [flashOpacity]);

  return { flashOpacity, triggerFlash };
}

// ─── Main Component ────────────────────────────────────────────
export const SyncEditorView: React.FC = () => {
  const activeTrack = usePlayerStore((s) => s.activeTrack);
  const lyrics = usePlayerStore((s) => s.lyrics);
  const setPositionMs = usePlayerStore((s) => s.setPositionMs);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);

  const [mode, setMode] = useState<'line' | 'word'>('line');
  const [celebrateExpanded, setCelebrateExpanded] = useState(false);
  const [isFineTuneOpen, setIsFineTuneOpen] = useState(false);

  const audioUri = activeTrack?.audioUri || 'https://etseverywhere.com/podpress_trac/web/259/0/lonely-spider-new.mp3';
  const player = useAudioPlayer(audioUri);
  const status = useAudioPlayerStatus(player);

  const currentMs = Math.floor((status.currentTime || 0) * 1000);
  const totalMs = Math.floor((status.duration || 0) * 1000) || activeTrack?.durationMs || 1;

  // History State Machine
  const [history, setHistory] = useState<SyncHistoryState>(() => createInitialHistory(lyrics));
  const [activeLineIndex, setActiveLineIndex] = useState<number>(0);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number>(0);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(0);

  // Flash animation
  const { flashOpacity, triggerFlash } = useFlashAnim();
  const listRef = useRef<FlatList>(null);
  const appliedTrackIdRef = useRef<string | undefined>(undefined);

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const findNextUnsyncedLine = (lines: LyricLine[]): number => {
    const i = lines.findIndex((l) => l.startMs <= 0);
    return i === -1 ? lines.length : i;
  };
  const findNextUnsyncedWord = (line: LyricLine | undefined): number => {
    if (!line || line.words.length === 0) return 0;
    const i = line.words.findIndex((w) => w.startMs <= 0);
    return i === -1 ? line.words.length : i;
  };

  // Rebuild editor state only when a different track is loaded.
  // `lyrics` also changes whenever a timestamp is marked (editor syncs the
  // store for playback), which must NOT reset the active line.
  useEffect(() => {
    if (appliedTrackIdRef.current === activeTrack?.id) return;
    appliedTrackIdRef.current = activeTrack?.id;
    setHistory(createInitialHistory(lyrics));
    setActiveLineIndex(0);
    setSelectedLineIndex(0);
    setActiveWordIndex(0);
    setMode('line');
  }, [activeTrack?.id, lyrics]);

  const currentLines = history.present;
  // A line is "synced" once it has a start timestamp and, in word mode, once
  // every word has been captured too. This prevents the last line from reading
  // as complete while its words are still being tapped.
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

  // ─── Mode Switching ────────────────────────────────────────
  const switchToWordMode = useCallback(() => {
    setMode('word');
    const li = clamp(activeLineIndex, 0, Math.max(currentLines.length - 1, 0));
    setSelectedLineIndex(li);
    setActiveWordIndex(findNextUnsyncedWord(currentLines[li]));
  }, [activeLineIndex, currentLines]);

  const switchToLineMode = useCallback(() => {
    setMode('line');
    const next = findNextUnsyncedLine(currentLines);
    setActiveLineIndex(next >= currentLines.length ? Math.max(currentLines.length - 1, 0) : next);
  }, [currentLines]);

  // ─── Core Actions ──────────────────────────────────────────
  const handleLineMark = useCallback(() => {
    if (allSynced || currentLines.length === 0) return;

    const idx = clamp(activeLineIndex, 0, currentLines.length - 1);
    const result = markLineBoundary(history, idx, currentMs);
    let nextHistory = result.history;

    // If this was the last line, auto-close its endMs
    if (idx === currentLines.length - 1) {
      nextHistory = finishLastLine(nextHistory, idx, totalMs);
    }

    setHistory(nextHistory);
    usePlayerStore.setState({ lyrics: nextHistory.present });

    const next = findNextUnsyncedLine(nextHistory.present);
    const nextActive = next >= nextHistory.present.length ? nextHistory.present.length - 1 : Math.max(next, 0);
    setActiveLineIndex(nextActive);
    setSelectedLineIndex(nextActive);

    // Visual + haptic feedback
    triggerFlash();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // Auto-scroll to next unsynced line
    if (next < nextHistory.present.length) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: Math.min(next, currentLines.length - 1),
          animated: true,
          viewPosition: 0.3,
        });
      }, 100);
    }
  }, [history, activeLineIndex, currentMs, currentLines, allSynced, totalMs, triggerFlash]);

  const handleWordMark = useCallback(() => {
    if (allSynced || currentLines.length === 0) return;

    const li = clamp(selectedLineIndex, 0, currentLines.length - 1);
    const line = currentLines[li];
    if (!line || line.words.length === 0) return;
    const wi = clamp(activeWordIndex, 0, line.words.length - 1);

    const result = markWordBoundary(history, li, wi, currentMs);
    let nextHistory = result.history;

    // Last word of the last line closes out the whole song
    const isLastWord = wi === line.words.length - 1;
    const isLastLine = li === currentLines.length - 1;
    if (isLastWord && isLastLine) {
      nextHistory = finishLastWord(nextHistory, li, wi, totalMs);
    }

    setHistory(nextHistory);
    usePlayerStore.setState({ lyrics: nextHistory.present });

    // Visual + haptic feedback
    triggerFlash();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const nextWord = findNextUnsyncedWord(nextHistory.present[li]);
    if (nextWord < line.words.length) {
      setActiveWordIndex(nextWord);
    } else {
      // This line's words are all captured — advance to the next unsynced line
      const nextLine = findNextUnsyncedLine(nextHistory.present);
      const nextLineIdx = nextLine >= nextHistory.present.length ? nextHistory.present.length - 1 : Math.max(nextLine, 0);
      setSelectedLineIndex(nextLineIdx);
      setActiveLineIndex(nextLineIdx);
      setActiveWordIndex(0);
    }
  }, [history, selectedLineIndex, activeWordIndex, currentMs, currentLines, allSynced, totalMs, triggerFlash]);

  const handleUndo = useCallback(async () => {
    if (history.past.length === 0) return;

    // Pause first so the rewind doesn't fight the playing audio loop
    const wasPlaying = status.playing;
    if (wasPlaying) {
      player.pause();
    }

    const nextHistory = undoSyncAction(history);
    setHistory(nextHistory);
    usePlayerStore.setState({ lyrics: nextHistory.present });

    // Step the focus back to the first unsynced line/word
    const nextLine = findNextUnsyncedLine(nextHistory.present);
    const nextLineIdx = nextLine >= nextHistory.present.length ? nextHistory.present.length - 1 : Math.max(Math.min(nextLine, nextHistory.present.length - 1), 0);
    setActiveLineIndex(nextLineIdx);
    setSelectedLineIndex(nextLineIdx);
    setActiveWordIndex(findNextUnsyncedWord(nextHistory.present[nextLineIdx]));

    // Rewind audio a few seconds so user can re-mark
    const rewindTarget = Math.max(0, currentMs - 3000);
    setPositionMs(rewindTarget);
    try {
      await player.seekTo(rewindTarget / 1000);
    } catch (e) {}

    // Resume playback smoothly once the seek settles
    if (wasPlaying) {
      setTimeout(() => player.play(), 80);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [history, currentMs, player, setPositionMs, status.playing]);

  const handleStartOver = useCallback(() => {
    Alert.alert(
      'Start Over?',
      'This will clear all your timestamps. You can undo this once if you change your mind.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            const nextHistory = resetAllTimestamps(history);
            setHistory(nextHistory);
            setActiveLineIndex(0);
            setSelectedLineIndex(0);
            setActiveWordIndex(0);
            usePlayerStore.setState({ lyrics: nextHistory.present });
            player.pause();
            player.seekTo(0);
            setPositionMs(0);
          },
        },
      ]
    );
  }, [history, player, setPositionMs]);

  const handleSave = useCallback(async () => {
    if (!activeTrack) return;
    try {
      await saveTrackLyrics(activeTrack.id, currentLines);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('✅ Saved!', 'Your sync timestamps have been saved.');
    } catch (e: any) {
      Alert.alert('Save Failed', e.message);
    }
  }, [activeTrack, currentLines]);

  // ─── Per-line delay / nudge by ms ──────────────────────────
  const handleShift = useCallback((deltaMs: number) => {
    if (currentLines.length === 0) return;
    const li = clamp(mode === 'word' ? selectedLineIndex : activeLineIndex, 0, currentLines.length - 1);
    const nextHistory = shiftLineTimestamp(history, li, deltaMs);
    setHistory(nextHistory);
    usePlayerStore.setState({ lyrics: nextHistory.present });
    Haptics.selectionAsync().catch(() => {});
  }, [history, mode, selectedLineIndex, activeLineIndex, currentLines.length]);

  // ─── Fine Tune handlers ────────────────────────────────────
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
    player.pause();
    setPositionMs(targetMs);
    player.seekTo(targetMs / 1000);
    setTimeout(() => player.play(), 60);
  }, [player, setPositionMs]);

  // ─── LRC export ────────────────────────────────────────────
  const handleExportLrc = useCallback(async () => {
    if (!activeTrack) return;
    try {
      await exportLyricsAsLrc(currentLines, activeTrack.title);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert('Export Failed', e.message || 'Could not export .lrc');
    }
  }, [activeTrack, currentLines]);

  // ─── Transport Controls ────────────────────────────────────
  const togglePlayPause = () => {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const handleSeek = (offsetMs: number) => {
    const target = Math.max(0, Math.min(totalMs, currentMs + offsetMs));
    player.seekTo(target / 1000);
    setPositionMs(target);
  };

  const formatMs = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  // ─── Next line/word text for the MARK button ───────────────
  const nextLineText = allSynced ? null : currentLines[activeIdx]?.text || '';
  const nextWordText = allSynced ? null : activeWord?.text || '';
  const wordModeDisabled = mode === 'word' && (!selectedLine || selectedLine.words.length === 0);

  // ─── Render ────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ─── HEADER ─── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.trackTitleBox}
          onPress={() => setIsLibraryModalOpen(true)}
        >
          <Text style={styles.trackTitle} numberOfLines={1}>
            🎵 {activeTrack?.title || 'No Track Loaded'}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {activeTrack?.artist || 'Tap to open library'}
          </Text>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setIsLibraryModalOpen(true)}
          >
            <Ionicons name="albums-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, styles.importBtnHeader]}
            onPress={() => setIsImportModalOpen(true)}
          >
            <Ionicons name="add" size={18} color="#000000" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── PROGRESS ─── */}
      <View style={styles.progressBar}>
        <Text style={styles.progressText}>
          {allSynced
            ? '🎉 All lines synced!'
            : `Line ${syncedCount + 1} of ${currentLines.length}`}
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${(syncedCount / Math.max(1, currentLines.length)) * 100}%` },
            ]}
          />
        </View>
      </View>

      {/* ─── MODE TOGGLE ─── */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'line' && styles.modeBtnActive]}
          onPress={switchToLineMode}
        >
          <Ionicons name="text-outline" size={14} color={mode === 'line' ? '#000000' : '#888888'} />
          <Text style={[styles.modeBtnText, mode === 'line' && styles.modeBtnTextActive]}>Line</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'word' && styles.modeBtnActive]}
          onPress={switchToWordMode}
        >
          <Ionicons name="return-down-forward-outline" size={14} color={mode === 'word' ? '#000000' : '#888888'} />
          <Text style={[styles.modeBtnText, mode === 'word' && styles.modeBtnTextActive]}>Word</Text>
        </TouchableOpacity>
      </View>

      {/* ─── WAVEFORM ─── */}
      <AudioWaveform
        positionMs={currentMs}
        durationMs={totalMs}
        onSeekRequested={(ms) => {
          player.seekTo(ms / 1000);
          setPositionMs(ms);
        }}
      />

      {/* ─── GREEN FLASH OVERLAY ─── */}
      <Animated.View
        pointerEvents="none"
        style={[styles.flashOverlay, { opacity: flashOpacity }]}
      />

      {/* ─── LYRICS LIST ─── */}
      <FlatList
        ref={listRef}
        data={currentLines}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onScrollToIndexFailed={() => {}}
        renderItem={({ item, index }) => {
          const state = getLineState(index, activeIdx, item, isLineSynced);

          return (
            <TouchableOpacity
              style={[
                styles.lineRow,
                state === 'active' && styles.lineRowActive,
                state === 'synced' && styles.lineRowSynced,
              ]}
              disabled={mode === 'line'}
              onPress={() => {
                setSelectedLineIndex(index);
                setActiveWordIndex(findNextUnsyncedWord(currentLines[index]));
              }}
            >
              {/* State icon */}
              <View style={styles.lineIcon}>
                {state === 'synced' && (
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                )}
                {state === 'active' && (
                  <View style={styles.activeDot} />
                )}
                {state === 'waiting' && (
                  <View style={styles.waitingDot} />
                )}
              </View>

              {/* Line text */}
              <View style={styles.lineTextContainer}>
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
                  <Text style={styles.lineTimestamp}>
                    {formatMs(item.startMs)} → {formatMs(item.endMs)}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* ─── FOOTER CONTROLS ─── */}
      <View style={styles.footer}>
        {/* Word chips (word mode only) */}
        {mode === 'word' && selectedLine && selectedLine.words.length > 0 && (
          <View style={styles.wordChipArea}>
            <Text style={styles.wordChipTitle} numberOfLines={1}>
              Line {activeIdx + 1} — tap each word as it's sung
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.wordChips}
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

        {/* Transport row */}
        <View style={styles.transportRow}>
          <TouchableOpacity style={styles.transportBtn} onPress={() => handleSeek(-5000)}>
            <Ionicons name="play-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.playPauseBtn} onPress={togglePlayPause}>
            <Ionicons
              name={status.playing ? 'pause' : 'play'}
              size={24}
              color="#000000"
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.transportBtn} onPress={() => handleSeek(5000)}>
            <Ionicons name="play-forward" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.transportSpacer} />

          <TouchableOpacity
            style={[styles.undoBtn, history.past.length === 0 && styles.btnDisabled]}
            disabled={history.past.length === 0}
            onPress={handleUndo}
          >
            <Ionicons name="arrow-undo" size={18} color="#FFFFFF" />
            <Text style={styles.undoBtnText}>Undo</Text>
          </TouchableOpacity>
        </View>

        {/* Per-line delay / nudge in ms */}
        {currentLines.length > 0 && (
          <View style={styles.delayRow}>
            <Text style={styles.delayLabel} numberOfLines={1}>
              Delay Line {activeIdx + 1}
            </Text>
            <View style={styles.delayBtns}>
              <TouchableOpacity style={styles.delayBtn} onPress={() => handleShift(-100)}>
                <Text style={styles.delayBtnText}>-100</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.delayBtn} onPress={() => handleShift(-10)}>
                <Text style={styles.delayBtnText}>-10</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.delayBtn} onPress={() => handleShift(10)}>
                <Text style={styles.delayBtnText}>+10</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.delayBtn} onPress={() => handleShift(100)}>
                <Text style={styles.delayBtnText}>+100</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── THE BIG MARK BUTTON ─── */}
        {allSynced ? celebrateExpanded ? (
          <View style={styles.celebrationBox}>
            <View style={styles.celebrationBoxHeader}>
              <Text style={styles.celebrationEmoji}>🎉</Text>
              <TouchableOpacity
                style={styles.collapseBtn}
                onPress={() => setCelebrateExpanded(false)}
              >
                <Ionicons name="chevron-up" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.celebrationTitle}>All Done!</Text>
            <Text style={styles.celebrationSub}>
              All {currentLines.length} lines are synced. Save your work or fine-tune.
            </Text>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Ionicons name="checkmark-circle" size={20} color="#000000" />
              <Text style={styles.saveBtnText}>Save Sync</Text>
            </TouchableOpacity>
            <View style={styles.celebrationActions}>
              <TouchableOpacity style={styles.celebrationActionBtn} onPress={() => setIsFineTuneOpen(true)}>
                <Ionicons name="options-outline" size={16} color="#00E5FF" />
                <Text style={styles.celebrationActionText}>Fine Tune</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.celebrationActionBtn} onPress={handleExportLrc}>
                <Ionicons name="download-outline" size={16} color="#00E5FF" />
                <Text style={styles.celebrationActionText}>Export .lrc</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.celebrationBar}>
            <Text style={styles.celebrationBarText} numberOfLines={1}>
              🎉 All {currentLines.length} lines synced
            </Text>
            <TouchableOpacity
              style={styles.celebrationSaveBtn}
              onPress={() => setIsFineTuneOpen(true)}
            >
              <Ionicons name="options-outline" size={16} color="#00E5FF" />
              <Text style={[styles.celebrationSaveText, { color: '#00E5FF' }]}>Fine Tune</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.celebrationSaveBtn} onPress={handleSave}>
              <Ionicons name="checkmark-circle" size={16} color="#000000" />
              <Text style={styles.celebrationSaveText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.collapseBarBtn}
              onPress={() => setCelebrateExpanded(true)}
            >
              <Ionicons name="chevron-down" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : mode === 'word' && wordModeDisabled ? (
          <TouchableOpacity
            style={[styles.markBtn, styles.markBtnDisabled]}
            disabled
            activeOpacity={0.7}
          >
            <Text style={styles.markLabel}>NO WORDS TO MARK</Text>
            <Text style={styles.markLineText} numberOfLines={2}>
              "{nextLineText}" has no word-level timestamps. Use Line mode or re-import lyrics.
            </Text>
          </TouchableOpacity>
        ) : mode === 'word' ? (
          <TouchableOpacity
            style={styles.markBtn}
            onPress={handleWordMark}
            activeOpacity={0.7}
          >
            <Text style={styles.markLabel}>👇 TAP WHEN YOU HEAR THIS WORD</Text>
            <Text style={styles.markLineText} numberOfLines={2}>
              "{nextWordText}"
            </Text>
            {selectedLine && (
              <Text style={styles.markWordProgress}>
                Word {activeWordIdx + 1} of {selectedLine.words.length} · Line {activeIdx + 1}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.markBtn}
            onPress={handleLineMark}
            activeOpacity={0.7}
          >
            <Text style={styles.markLabel}>👇 TAP WHEN YOU HEAR THIS LINE</Text>
            <Text style={styles.markLineText} numberOfLines={2}>
              "{nextLineText}"
            </Text>
          </TouchableOpacity>
        )}

        {/* Bottom actions row */}
        <View style={styles.bottomRow}>
          <TouchableOpacity
            style={styles.startOverBtn}
            onPress={handleStartOver}
          >
            <Ionicons name="refresh" size={16} color="#EF4444" />
            <Text style={styles.startOverText}>Start Over</Text>
          </TouchableOpacity>

          {!allSynced && (
            <TouchableOpacity style={styles.saveSmallBtn} onPress={handleSave}>
              <Ionicons name="save-outline" size={16} color="#10B981" />
              <Text style={styles.saveSmallText}>Save</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

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

// ─── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0C10',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1D27',
  },
  trackTitleBox: {
    flex: 1,
    marginRight: 12,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  trackArtist: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    backgroundColor: '#1E2430',
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importBtnHeader: {
    backgroundColor: '#00E5FF',
  },

  // Progress bar
  progressBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  progressText: {
    color: '#AAAAAA',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#1E2430',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },

  // Mode toggle
  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E2430',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    justifyContent: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#00E5FF',
  },
  modeBtnText: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '800',
  },
  modeBtnTextActive: {
    color: '#000000',
  },

  // Flash overlay
  flashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    zIndex: 10,
  },

  // Lyrics list
  list: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  lineRowActive: {
    backgroundColor: '#141C2E',
    borderColor: '#00E5FF',
    borderWidth: 1.5,
  },
  lineRowSynced: {
    backgroundColor: '#0D1A14',
    borderColor: '#10B98130',
  },
  lineIcon: {
    width: 28,
    alignItems: 'center',
    marginRight: 10,
  },
  activeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#00E5FF',
  },
  waitingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333A4A',
  },
  lineTextContainer: {
    flex: 1,
  },
  lineText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#888888',
  },
  lineTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  lineTextSynced: {
    color: '#10B981',
    fontWeight: '600',
  },
  lineTextWaiting: {
    color: '#555555',
  },
  lineTimestamp: {
    color: '#10B98180',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },

  // Word chips (word mode)
  wordChipArea: {
    marginBottom: 10,
  },
  wordChipTitle: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  wordChips: {
    gap: 8,
    paddingRight: 16,
  },
  wordChip: {
    backgroundColor: '#1E2430',
    borderWidth: 1,
    borderColor: '#2A3140',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  wordChipActive: {
    backgroundColor: '#00E5FF',
    borderColor: '#00E5FF',
  },
  wordChipSynced: {
    backgroundColor: '#0D1A14',
    borderColor: '#10B98140',
  },
  wordChipText: {
    color: '#888888',
    fontSize: 13,
    fontWeight: '700',
  },
  wordChipTextActive: {
    color: '#000000',
  },
  wordChipTextSynced: {
    color: '#10B981',
  },

  // Footer
  footer: {
    backgroundColor: '#12151E',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#222834',
  },

  // Transport
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  transportBtn: {
    padding: 8,
  },
  playPauseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  transportSpacer: {
    flex: 1,
  },
  delayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  delayLabel: {
    color: '#AAAAAA',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  delayBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  delayBtn: {
    backgroundColor: '#1E2430',
    borderWidth: 1,
    borderColor: '#2A3140',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  delayBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E2430',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  undoBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.3,
  },

  // Mark button
  markBtn: {
    backgroundColor: '#00E5FF',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  markLabel: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  markLineText: {
    color: '#00000099',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  markWordProgress: {
    color: '#00000066',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  markBtnDisabled: {
    backgroundColor: '#3A4356',
    shadowOpacity: 0,
    elevation: 0,
  },

  // Celebration
  celebrationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1A14',
    borderWidth: 1,
    borderColor: '#10B98140',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 10,
  },
  celebrationBarText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
  },
  celebrationSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  celebrationSaveText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '900',
  },
  celebrationBoxHeader: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  collapseBtn: {
    position: 'absolute',
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#232B3A',
    borderWidth: 1,
    borderColor: '#3A4356',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapseBarBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#232B3A',
    borderWidth: 1,
    borderColor: '#3A4356',
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationBox: {
    backgroundColor: '#0D1A14',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#10B98140',
  },
  celebrationEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  celebrationTitle: {
    color: '#10B981',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 6,
  },
  celebrationSub: {
    color: '#888888',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  saveBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '900',
  },
  celebrationActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  celebrationActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12151E',
    borderWidth: 1,
    borderColor: '#00E5FF40',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  celebrationActionText: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '800',
  },

  // Bottom row
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  startOverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  startOverText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
  saveSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  saveSmallText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '700',
  },
});
