import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { usePlayerStore } from '../../features/player/store/usePlayerStore';
import { useAudioSync } from '../../features/synchronization/hooks/useAudioSync';
import { SynchronizedLyricsView } from '../../features/synchronization/components/SynchronizedLyricsView';
import { TrackLibraryModal } from '../../features/player/components/TrackLibraryModal';
import { ImportTrackModal } from '../../features/creator/components/ImportTrackModal';

export default function ListenerPlayerScreen() {
  const activeTrack = usePlayerStore((s) => s.activeTrack);
  const lyrics = usePlayerStore((s) => s.lyrics);
  const setPositionMs = usePlayerStore((s) => s.setPositionMs);
  const setDurationMs = usePlayerStore((s) => s.setDurationMs);
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const audioUri = activeTrack?.audioUri || 'https://etseverywhere.com/podpress_trac/web/259/0/lonely-spider-new.mp3';
  const player = useAudioPlayer(audioUri);
  const status = useAudioPlayerStatus(player);

  const { timeMs } = useAudioSync();

  // Enable audio in silent mode on iOS
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Synchronize real AudioPlayer status to Zustand state & Reanimated clock
  useEffect(() => {
    if (status) {
      const curMs = Math.floor((status.currentTime || 0) * 1000);
      const durMs = Math.floor((status.duration || 0) * 1000);

      setPositionMs(curMs);
      if (durMs > 0) setDurationMs(durMs);
      setIsPlaying(status.playing);
    }
  }, [status.currentTime, status.duration, status.playing, setPositionMs, setDurationMs, setIsPlaying]);

  const togglePlayPause = () => {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const handleSeekOffset = (offsetMs: number) => {
    const targetMs = Math.max(0, Math.min((status.duration || 0) * 1000, status.currentTime * 1000 + offsetMs));
    player.seekTo(targetMs / 1000);
    setPositionMs(targetMs);
  };

  const handleNativeLineSeek = (targetMs: number) => {
    if (targetMs > 0) {
      player.seekTo(targetMs / 1000);
      setPositionMs(targetMs);
    }
  };

  const formatMs = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  if (!activeTrack) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No track selected</Text>
        <TouchableOpacity style={styles.emptyBtn} onPress={() => setIsLibraryOpen(true)}>
          <Text style={styles.emptyBtnText}>Open Library</Text>
        </TouchableOpacity>
        <TrackLibraryModal visible={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} />
      </View>
    );
  }

  const currentMs = Math.floor((status.currentTime || 0) * 1000);
  const totalMs = Math.floor((status.duration || 0) * 1000) || activeTrack.durationMs;

  return (
    <View style={styles.container}>
      {/* HEADER ALBUM & TRACK INFO WITH LIBRARY BUTTON */}
      <View style={styles.trackHeader}>
        <Image
          source={{ uri: activeTrack.coverUri || 'https://picsum.photos/400/400' }}
          style={styles.coverArt}
        />
        <TouchableOpacity
          style={styles.trackDetails}
          onPress={() => setIsLibraryOpen(true)}
        >
          <Text style={styles.trackTitle} numberOfLines={1}>
            {activeTrack.title}
          </Text>
          <Text style={styles.artistName}>
            {activeTrack.artist} • <Text style={styles.libraryLink}>Switch Song ▾</Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerLibraryBtn}
          onPress={() => setIsLibraryOpen(true)}
        >
          <Ionicons name="albums-outline" size={20} color="#00E5FF" />
        </TouchableOpacity>
      </View>

      {/* SYNCHRONIZED LYRICS DISPLAY (UI-THREAD REANIMATED) */}
      <View style={styles.lyricsContainer}>
        <SynchronizedLyricsView
          lines={lyrics}
          timeMs={timeMs}
          onSeekRequested={handleNativeLineSeek}
        />
      </View>

      {/* AUDIO PLAYER CONTROLS FOOTER */}
      <View style={styles.playerFooter}>
        <View style={styles.progressRow}>
          <Text style={styles.timeText}>{formatMs(currentMs)}</Text>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${(currentMs / (totalMs || 1)) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.timeText}>{formatMs(totalMs)}</Text>
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => handleSeekOffset(-5000)}
          >
            <Ionicons name="play-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.playPauseBtn}
            onPress={togglePlayPause}
          >
            <Ionicons
              name={status.playing ? 'pause' : 'play'}
              size={36}
              color="#000000"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => handleSeekOffset(5000)}
          >
            <Ionicons name="play-forward" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* MODALS */}
      <TrackLibraryModal
        visible={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onOpenImport={() => setIsImportOpen(true)}
      />

      <ImportTrackModal
        visible={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1117',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#0F1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#888888',
    fontSize: 16,
    marginBottom: 16,
  },
  emptyBtn: {
    backgroundColor: '#00E5FF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyBtnText: {
    color: '#000000',
    fontWeight: '800',
  },
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1D27',
  },
  coverArt: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 14,
  },
  trackDetails: {
    flex: 1,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  artistName: {
    color: '#888888',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  libraryLink: {
    color: '#00E5FF',
  },
  headerLibraryBtn: {
    backgroundColor: '#1E2430',
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lyricsContainer: {
    flex: 1,
  },
  playerFooter: {
    backgroundColor: '#12151E',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#222834',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  timeText: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '600',
    width: 40,
    textAlign: 'center',
  },
  progressBarBackground: {
    flex: 1,
    height: 6,
    backgroundColor: '#262C3A',
    borderRadius: 3,
    marginHorizontal: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00E5FF',
    borderRadius: 3,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  controlBtn: {
    padding: 8,
  },
  playPauseBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
