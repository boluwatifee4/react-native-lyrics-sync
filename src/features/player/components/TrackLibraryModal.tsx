import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Track } from '../../../domain/lyrics';
import { fetchAllTracks, deleteTrack, fetchTrackWithLyrics } from '../../../services/db';
import { usePlayerStore } from '../store/usePlayerStore';

interface TrackLibraryModalProps {
  visible: boolean;
  onClose: () => void;
  onOpenImport?: () => void;
}

export const TrackLibraryModal: React.FC<TrackLibraryModalProps> = ({
  visible,
  onClose,
  onOpenImport,
}) => {
  const insets = useSafeAreaInsets();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const activeTrack = usePlayerStore((s) => s.activeTrack);
  const setActiveTrack = usePlayerStore((s) => s.setActiveTrack);

  const loadTracks = async () => {
    setLoading(true);
    try {
      const all = await fetchAllTracks();
      setTracks(all);
    } catch (e) {
      console.error('Failed to load tracks:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadTracks();
    }
  }, [visible]);

  const handleDelete = async (track: Track) => {
    Alert.alert(
      'Delete Song',
      `Delete "${track.title}" and its lyrics?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTrack(track.id);
            loadTracks();
          },
        },
      ]
    );
  };

  const handleSelectTrack = async (trackId: string) => {
    const data = await fetchTrackWithLyrics(trackId);
    if (data) {
      setActiveTrack(data.track, data.lines);
      onClose();
    }
  };

  const getStatusTelemetry = (status: Track['syncStatus']) => {
    switch (status) {
      case 'word_synced':
        return { label: 'WORD SYNCED', color: '#30D158' };
      case 'line_synced':
        return { label: 'LINE SYNCED', color: '#3E9BFF' };
      default:
        return { label: 'RAW DRAFT', color: '#71717A' };
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" statusBarTranslucent={true} onRequestClose={onClose}>
      <View
        style={[
          styles.container,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        {/* ─── TITLEBAR ─── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerLabel}>STORAGE // ASSETS</Text>
            <Text style={styles.headerTitle}>Audio Flight Library</Text>
          </View>
          <View style={styles.headerActions}>
            {onOpenImport && (
              <TouchableOpacity
                style={styles.ingestBtn}
                onPress={() => {
                  onClose();
                  onOpenImport();
                }}
              >
                <Ionicons name="add" size={14} color="#3E9BFF" />
                <Text style={styles.ingestBtnText}>INGEST</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={styles.doneBtn}>
              <Text style={styles.doneText}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── TRACK DIRECTORY LIST ─── */}
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Math.max(insets.bottom, 20) + 16 },
          ]}
          renderItem={({ item, index }) => {
            const isActive = item.id === activeTrack?.id;
            const status = getStatusTelemetry(item.syncStatus);

            return (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleSelectTrack(item.id)}
                style={[styles.trackRow, isActive && styles.trackRowActive]}
              >
                {/* Status indicator bar */}
                <View
                  style={[
                    styles.activeIndicator,
                    { backgroundColor: isActive ? '#3E9BFF' : 'transparent' },
                  ]}
                />

                {/* Index numbering */}
                <Text style={[styles.indexNum, isActive && styles.indexNumActive]}>
                  {(index + 1).toString().padStart(2, '0')}
                </Text>

                {/* Track metadata */}
                <View style={styles.trackDetails}>
                  <Text
                    style={[styles.trackTitle, isActive && styles.trackTitleActive]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <View style={styles.subRow}>
                    <Text style={styles.artistName} numberOfLines={1}>
                      {item.artist}
                    </Text>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={[styles.statusBadge, { color: status.color }]}>
                      {status.label}
                    </Text>
                  </View>
                </View>

                {/* Actions */}
                {item.id !== 'sample-1' && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(item)}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={16} color="#71717A" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
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
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  headerLabel: {
    color: '#52525B',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  headerTitle: {
    color: '#F4F4F5',
    fontSize: 16,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ingestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#08080A',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 2,
    gap: 4,
  },
  ingestBtnText: {
    color: '#3E9BFF',
    fontWeight: '600',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  doneBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  doneText: {
    color: '#F4F4F5',
    fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.8,
  },
  list: {
    paddingVertical: 4,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#121214',
    position: 'relative',
  },
  trackRowActive: {
    backgroundColor: '#08080C',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
  },
  indexNum: {
    color: '#3F3F46',
    fontSize: 11,
    fontWeight: '500',
    width: 28,
    fontVariant: ['tabular-nums'],
  },
  indexNumActive: {
    color: '#3E9BFF',
  },
  trackDetails: {
    flex: 1,
    paddingRight: 12,
  },
  trackTitle: {
    color: '#F4F4F5',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  trackTitleActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 6,
  },
  artistName: {
    color: '#8A8A8E',
    fontSize: 12,
  },
  metaDot: {
    color: '#3F3F46',
    fontSize: 10,
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  deleteBtn: {
    padding: 6,
  },
});
