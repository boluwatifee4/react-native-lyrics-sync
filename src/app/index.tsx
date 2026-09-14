import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { fetchAllTracks, fetchTrackWithLyrics, deleteTrack, resetTrackSync } from '../services/db';
import { usePlayerStore } from '../features/player/store/usePlayerStore';
import { ImportTrackModal } from '../features/creator/components/ImportTrackModal';
import { SwipeableTrackRow } from '../components/SwipeableTrackRow';
import { Track } from '../domain/lyrics';
import { Colors, Typography } from '../constants/theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const setActiveTrack = usePlayerStore((s) => s.setActiveTrack);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const theme = Colors.dark;

  const loadTracks = useCallback(async () => {
    try {
      const allTracks = await fetchAllTracks();
      setTracks(allTracks);
    } catch (e) {
      console.error('Failed to load tracks:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTracks();
    }, [loadTracks])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadTracks();
  };

  const handleSelectTrack = async (track: Track) => {
    try {
      const data = await fetchTrackWithLyrics(track.id);
      if (data) {
        setActiveTrack(data.track, data.lines);
        router.push({ pathname: '/player', params: { autoplay: '1' } });
      }
    } catch (e) {
      console.error('Failed to load track:', e);
    }
  };

  const handleImportComplete = async (trackId: string) => {
    try {
      const data = await fetchTrackWithLyrics(trackId);
      if (data) {
        setActiveTrack(data.track, data.lines);
        setIsImportOpen(false);
        router.push('/editor');
      }
    } catch (e) {
      console.error('Failed to load imported track:', e);
    }
  };

  const handleDelete = async (trackId: string) => {
    try {
      await deleteTrack(trackId);
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
    } catch (e) {
      console.error('Failed to delete track:', e);
    }
  };

  const handleResetSync = async (trackId: string) => {
    try {
      await resetTrackSync(trackId);
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId ? { ...t, syncStatus: 'draft' } : t
        )
      );
    } catch (e) {
      console.error('Failed to reset sync:', e);
    }
  };

  const renderTrack = ({ item }: { item: Track }) => {
    return (
      <SwipeableTrackRow
        track={item}
        onSelect={handleSelectTrack}
        onDelete={handleDelete}
        onResetSync={handleResetSync}
      />
    );
  };

  const heroSteps = [
    { icon: 'cloud-upload-outline' as const, title: 'Bring it in', sub: 'Add a song and its lyrics' },
    { icon: 'radio-button-on-outline' as const, title: 'Tap along', sub: 'Time the words to the music' },
    { icon: 'flame-outline' as const, title: 'Feel it play', sub: 'Watch lyrics light up as it runs' },
  ];

  const renderHero = () => (
    <View style={styles.heroCard}>
      <Text style={styles.heroTagline}>
        Your lyrics, playing right on the music.
      </Text>
      <Text style={styles.heroSub}>
        No auto-detection magic, no guesswork. Just you, the song, and a tap.
      </Text>
      <View style={styles.heroSteps}>
        {heroSteps.map((step, idx) => (
          <View key={step.title} style={styles.heroStep}>
            <View style={styles.heroStepIcon}>
              <Ionicons name={step.icon} size={16} color={theme.accent} />
            </View>
            <View style={styles.heroStepText}>
              <Text style={styles.heroStepTitle}>
                {idx + 1}. {step.title}
              </Text>
              <Text style={styles.heroStepSub}>{step.sub}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderHeader = () => (
    <View>
      {renderHero()}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleGroup}>
          <Text style={styles.sectionTitle}>YOUR TRACKS</Text>
          <Text style={styles.trackCount}>{tracks.length}</Text>
        </View>
        <View style={styles.tapHint}>
          <Ionicons name="play" size={9} color={theme.accent} />
          <Text style={styles.tapHintText}>TAP TO PLAY</Text>
        </View>
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <TouchableOpacity
        style={styles.emptyImportBtn}
        onPress={() => setIsImportOpen(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="add" size={18} color={theme.accent} />
        <Text style={styles.emptyImportText}>ADD YOUR FIRST SONG</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* ─── HEADER ─── */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.brandMark}>
            <Ionicons name="radio" size={14} color={theme.accent} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Lyric Sync</Text>
            <Text style={styles.headerSubtitle}>WHERE WORDS MEET MUSIC</Text>
          </View>
        </View>
      </View>

      {/* ─── TRACK LIST ─── */}
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={styles.loaderText}>Scanning library...</Text>
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          renderItem={renderTrack}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.accent}
            />
          }
        />
      )}

      {/* ─── FAB ─── */}
      {tracks.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { bottom: Math.max(insets.bottom, 20) + 20 }]}
          onPress={() => setIsImportOpen(true)}
          activeOpacity={0.75}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* ─── IMPORT MODAL ─── */}
      <ImportTrackModal
        visible={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportComplete={handleImportComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.void,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.dark.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    ...Typography.microLabel,
    color: Colors.dark.textTertiary,
    marginTop: 1,
  },

  // ── Hero ──
  heroCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.hairline,
    padding: 20,
    marginBottom: 20,
  },
  heroTagline: {
    color: Colors.dark.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
    lineHeight: 23,
  },
  heroSub: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 16,
  },
  heroSteps: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.hairline,
    paddingTop: 4,
  },
  heroStep: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  heroStepIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.dark.accentGlow,
    borderWidth: 1,
    borderColor: Colors.dark.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStepText: {
    flex: 1,
  },
  heroStepTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
  heroStepSub: {
    color: Colors.dark.textTertiary,
    fontSize: 11,
    marginTop: 1,
  },

  // ── Section ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.hairline,
    marginBottom: 12,
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  sectionTitle: {
    ...Typography.microLabel,
    color: Colors.dark.textPrimary,
    fontSize: 11,
  },
  trackCount: {
    ...Typography.instrumentLabel,
    color: Colors.dark.textGhost,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  tapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tapHintText: {
    ...Typography.microLabel,
    fontSize: 9,
    letterSpacing: 0.8,
    color: Colors.dark.accent,
  },

  // ── List ──
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },

  // ── Track Card ──
  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
  },
  trackCover: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: Colors.dark.hairline,
    marginRight: 14,
  },
  trackInfo: {
    flex: 1,
    gap: 3,
  },
  trackTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  trackArtist: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    fontWeight: '400',
  },
  trackFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusLabel: {
    ...Typography.microLabel,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  trackAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.accentGlow,
    borderWidth: 1,
    borderColor: Colors.dark.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },

  // ── Empty State ──
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 32,
  },
  emptyImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.accentMuted,
    borderWidth: 1,
    borderColor: Colors.dark.accent + '40',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  emptyImportText: {
    color: Colors.dark.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  // ── Loader ──
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loaderText: {
    ...Typography.instrumentLabel,
    color: Colors.dark.textMuted,
  },

  // ── FAB ──
  fab: {
    position: 'absolute',
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.dark.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
});
