import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { usePlayerStore } from '../features/player/store/usePlayerStore';
import { useAudioSync } from '../features/synchronization/hooks/useAudioSync';
import { SynchronizedLyricsView } from '../features/synchronization/components/SynchronizedLyricsView';
import { AudioWaveform } from '../features/synchronization/components/AudioWaveform';
import { TrackLibraryModal } from '../features/player/components/TrackLibraryModal';
import { ImportTrackModal } from '../features/creator/components/ImportTrackModal';
import { AudioLoadingOverlay } from '../components/AudioLoadingOverlay';
import { Colors } from '../constants/theme';

const DEFAULT_AUDIO_URI = Image.resolveAssetSource(
  require('../../assets/audio/Johnny-Drille-How-Are-You-My-Friend-Vistanaij.com_.mp3')
).uri;

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const activeTrack = usePlayerStore((s) => s.activeTrack);
  const lyrics = usePlayerStore((s) => s.lyrics);
  const setPositionMs = usePlayerStore((s) => s.setPositionMs);
  const setDurationMs = usePlayerStore((s) => s.setDurationMs);
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const { autoplay } = useLocalSearchParams<{ autoplay?: string }>();
  const autoplayConsumed = useRef(false);
  const [autoplayTimedOut, setAutoplayTimedOut] = useState(false);

  const audioUri = activeTrack?.audioUri || DEFAULT_AUDIO_URI;
  const player = useAudioPlayer(audioUri, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  const { timeMs } = useAudioSync();
  const theme = Colors.dark;

  const lastPositionRef = useRef(-1);
  const lastDurationRef = useRef(-1);
  const lastPlayingRef = useRef<boolean | null>(null);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Auto-play once the audio is loaded and ready
  useEffect(() => {
    if (
      autoplay === '1' &&
      !autoplayConsumed.current &&
      status.isLoaded &&
      !status.playing
    ) {
      autoplayConsumed.current = true;
      try {
        player.play();
      } catch (e) {
        console.warn('Autoplay error:', e);
      }
    }
  }, [autoplay, status.isLoaded, status.playing, player]);

  // If the audio never becomes ready, dismiss the loading HUD so the
  // screen doesn't look stuck (user can still hit play manually).
  useEffect(() => {
    if (autoplay !== '1' || autoplayConsumed.current || status.playing) return;
    if (status.isLoaded) return;
    const timer = setTimeout(() => setAutoplayTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [autoplay, autoplayConsumed, status.isLoaded, status.playing]);

  useEffect(() => {
    if (status) {
      const curMs = Math.floor((status.currentTime || 0) * 1000);
      const durMs = Math.floor((status.duration || 0) * 1000);
      const qMs = Math.floor(curMs / 200) * 200;

      if (qMs !== lastPositionRef.current) {
        lastPositionRef.current = qMs;
        setPositionMs(curMs);
      }
      if (durMs > 0 && durMs !== lastDurationRef.current) {
        lastDurationRef.current = durMs;
        setDurationMs(durMs);
      }
      if (status.playing !== lastPlayingRef.current) {
        lastPlayingRef.current = status.playing;
        setIsPlaying(status.playing);
      }
    }
  }, [status.currentTime, status.duration, status.playing, setPositionMs, setDurationMs, setIsPlaying]);

  const togglePlayPause = useCallback(() => {
    try {
      if (status.playing) {
        player.pause();
      } else {
        player.play();
      }
    } catch (e) {
      console.warn('togglePlayPause error:', e);
    }
  }, [status.playing, player]);

  const handleSeekOffset = useCallback((offsetMs: number) => {
    try {
      const cur = Math.floor((status.currentTime || 0) * 1000);
      const dur = Math.floor((status.duration || 0) * 1000);
      const targetMs = Math.max(0, Math.min(dur, cur + offsetMs));
      player.seekTo(targetMs / 1000);
      setPositionMs(targetMs);
    } catch (e) {
      console.warn('seekOffset error:', e);
    }
  }, [status.currentTime, status.duration, player, setPositionMs]);

  const handleNativeLineSeek = useCallback((targetMs: number) => {
    try {
      if (targetMs >= 0) {
        player.seekTo(targetMs / 1000);
        setPositionMs(targetMs);
      }
    } catch (e) {
      console.warn('lineSeek error:', e);
    }
  }, [player, setPositionMs]);

  const handleOpenEditor = () => {
    router.push('/editor');
  };

  const formatMs = (ms: number) => {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  if (!activeTrack) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyLabel}>NO ACTIVE TRACK</Text>
        <Text style={styles.emptySub}>Select a track from the library to begin playback</Text>
        <TouchableOpacity style={styles.primaryActionBtn} onPress={() => setIsLibraryOpen(true)}>
          <Ionicons name="folder-open-outline" size={16} color="#000000" />
          <Text style={styles.primaryActionText}>Open Track Library</Text>
        </TouchableOpacity>
        <TrackLibraryModal
          visible={isLibraryOpen}
          onClose={() => setIsLibraryOpen(false)}
          onOpenImport={() => setIsImportOpen(true)}
        />
        <ImportTrackModal visible={isImportOpen} onClose={() => setIsImportOpen(false)} />
      </View>
    );
  }

  const currentMs = Math.floor((status.currentTime || 0) * 1000);
  const totalMs = Math.floor((status.duration || 0) * 1000) || activeTrack.durationMs;
  const progressRatio = totalMs > 0 ? Math.min(1, Math.max(0, currentMs / totalMs)) : 0;

  return (
    <View style={styles.container}>
      {/* ─── TRACK TELEMETRY HEADER ─── */}
      <View style={[styles.trackHeader, { paddingTop: Math.max(insets.top, 14) }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={8}
          activeOpacity={0.65}
        >
          <Ionicons
            name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
            size={22}
            color={Colors.dark.textPrimary}
          />
        </TouchableOpacity>

        <Image
          source={{ uri: activeTrack.coverUri || 'https://picsum.photos/400/400' }}
          style={styles.coverArt}
        />
        <TouchableOpacity
          style={styles.trackDetails}
          onPress={() => setIsLibraryOpen(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.trackTitle} numberOfLines={1}>
            {activeTrack.title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.artistName} numberOfLines={1}>
              {activeTrack.artist}
            </Text>
            <Text style={styles.metaDot}>•</Text>
            <Text style={styles.libraryLink}>LIBRARY ▾</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerActionBtn}
          onPress={handleOpenEditor}
          hitSlop={8}
        >
          <Ionicons name="create-outline" size={20} color={theme.accent} />
        </TouchableOpacity>
      </View>

      {/* ─── ACOUSTIC TIMELINE INSTRUMENT ─── */}
      <AudioWaveform
        positionMs={currentMs}
        durationMs={totalMs}
        onSeekRequested={handleNativeLineSeek}
      />

      {/* ─── SYNCHRONIZED LYRICS ATMOSPHERE ─── */}
      <View style={styles.lyricsContainer}>
        <SynchronizedLyricsView
          lines={lyrics}
          timeMs={timeMs}
          onSeekRequested={handleNativeLineSeek}
        />
      </View>

      {/* ─── INSTRUMENTATION TRANSPORT FOOTER ─── */}
      <View style={styles.playerFooter}>
        <View style={styles.progressRow}>
          <Text style={styles.timeText}>{formatMs(currentMs)}</Text>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${progressRatio * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.timeText}>{formatMs(totalMs)}</Text>
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => handleSeekOffset(-5000)}
            hitSlop={12}
          >
            <Ionicons name="play-back" size={20} color="#71717A" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.playPauseBtn}
            onPress={togglePlayPause}
            activeOpacity={0.8}
          >
            <Ionicons
              name={status.playing ? 'pause' : 'play'}
              size={22}
              color={theme.accent}
              style={{ marginLeft: status.playing ? 0 : 2 }}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => handleSeekOffset(5000)}
            hitSlop={12}
          >
            <Ionicons name="play-forward" size={20} color="#71717A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── MODALS ─── */}
      <TrackLibraryModal
        visible={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onOpenImport={() => setIsImportOpen(true)}
      />

      <ImportTrackModal
        visible={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />

      {/* ─── AUDIO LOADING HUD ─── */}
      {autoplay === '1' &&
        !autoplayConsumed.current &&
        !status.playing &&
        !autoplayTimedOut && (
          <AudioLoadingOverlay />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyLabel: {
    color: '#52525B',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  emptySub: {
    color: '#A1A1AA',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 2,
    gap: 8,
  },
  primaryActionText: {
    color: '#000000',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.dark.hairlineActive,
    backgroundColor: Colors.dark.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  coverArt: {
    width: 40,
    height: 40,
    borderRadius: 2,
    marginRight: 14,
    backgroundColor: '#18181B',
  },
  trackDetails: {
    flex: 1,
  },
  trackTitle: {
    color: '#F4F4F5',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 6,
  },
  artistName: {
    color: '#A1A1AA',
    fontSize: 12,
    fontWeight: '400',
  },
  metaDot: {
    color: '#3F3F46',
    fontSize: 10,
  },
  libraryLink: {
    color: '#3E9BFF',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  headerActionBtn: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lyricsContainer: {
    flex: 1,
  },
  playerFooter: {
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#18181B',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  timeText: {
    color: '#71717A',
    fontSize: 11,
    fontWeight: '500',
    width: 44,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  progressBarBackground: {
    flex: 1,
    height: 2,
    backgroundColor: '#18181B',
    borderRadius: 1,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3E9BFF',
    borderRadius: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  controlBtn: {
    padding: 8,
  },
  playPauseBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#08080A',
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
