import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchAllTracks, fetchTrackWithLyrics, deleteTrack } from '../../../services/db';
import { usePlayerStore } from '../store/usePlayerStore';
import { Track } from '../../../domain/lyrics';

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
  const [tracks, setTracks] = useState<Track[]>([]);
  const activeTrack = usePlayerStore((s) => s.activeTrack);
  const setActiveTrack = usePlayerStore((s) => s.setActiveTrack);

  const loadTracks = async () => {
    try {
      const all = await fetchAllTracks();
      setTracks(all);
    } catch (e) {
      console.error('Failed to load tracks:', e);
    }
  };

  useEffect(() => {
    if (visible) {
      loadTracks();
    }
  }, [visible]);

  const handleSelectTrack = async (trackId: string) => {
    const data = await fetchTrackWithLyrics(trackId);
    if (data) {
      setActiveTrack(data.track, data.lines);
      onClose();
    }
  };

  const handleDeleteTrack = async (trackId: string, trackTitle: string) => {
    Alert.alert('Delete Track', `Are you sure you want to delete "${trackTitle}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTrack(trackId);
          await loadTracks();
          if (activeTrack?.id === trackId) {
            const remaining = tracks.filter((t) => t.id !== trackId);
            if (remaining.length > 0) {
              const next = await fetchTrackWithLyrics(remaining[0].id);
              if (next) setActiveTrack(next.track, next.lines);
            }
          }
        },
      },
    ]);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'word_synced':
        return { label: '✓ Word Synced', bg: '#065F46', text: '#34D399' };
      case 'line_synced':
        return { label: '✓ Line Synced', bg: '#1E3A8A', text: '#60A5FA' };
      default:
        return { label: '○ Draft (Needs Sync)', bg: '#374151', text: '#FBBF24' };
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Track Library</Text>
          <View style={styles.headerActions}>
            {onOpenImport && (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => {
                  onClose();
                  onOpenImport();
                }}
              >
                <Text style={styles.addBtnText}>+ New</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isActive = item.id === activeTrack?.id;
            const badge = getStatusBadge(item.syncStatus);

            return (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleSelectTrack(item.id)}
                style={[styles.trackCard, isActive && styles.activeCard]}
              >
                <View style={styles.iconBox}>
                  <Ionicons
                    name={isActive ? 'musical-notes' : 'disc-outline'}
                    size={24}
                    color={isActive ? '#00E5FF' : '#888888'}
                  />
                </View>

                <View style={styles.trackInfo}>
                  <Text style={[styles.trackTitle, isActive && styles.activeTrackTitle]}>
                    {item.title}
                  </Text>
                  <Text style={styles.artistName}>{item.artist}</Text>

                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>
                      {badge.label}
                    </Text>
                  </View>
                </View>

                {item.id !== 'sample-1' && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteTrack(item.id, item.title)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
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
    backgroundColor: '#0F1117',
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222834',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addBtn: {
    backgroundColor: '#00E5FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 12,
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    color: '#00E5FF',
    fontWeight: '700',
    fontSize: 16,
  },
  list: {
    padding: 16,
  },
  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161922',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#242A38',
  },
  activeCard: {
    borderColor: '#00E5FF',
    backgroundColor: '#1C2333',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1F2432',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  activeTrackTitle: {
    color: '#00E5FF',
  },
  artistName: {
    color: '#888888',
    fontSize: 13,
    marginTop: 2,
    marginBottom: 6,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 8,
  },
});
