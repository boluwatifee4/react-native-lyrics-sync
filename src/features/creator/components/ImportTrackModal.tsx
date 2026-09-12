import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { createTrack } from '../../../services/db';
import { usePlayerStore } from '../../player/store/usePlayerStore';
import { Track, LyricLine } from '../../../domain/lyrics';
import { parseLyricsDocument } from '../../../domain/timelineEngine';

interface ImportTrackModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ImportTrackModal: React.FC<ImportTrackModalProps> = ({ visible, onClose }) => {
  const [audioType, setAudioType] = useState<'url' | 'file'>('url');
  const [audioUrlInput, setAudioUrlInput] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [lyricsFileName, setLyricsFileName] = useState<string | null>(null);
  const [plainLyrics, setPlainLyrics] = useState('');
  const setActiveTrack = usePlayerStore((s) => s.setActiveTrack);

  const handlePickAudio = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        setAudioUri(asset.uri);
        setAudioFileName(asset.name || 'Selected Audio File');

        // Auto-fill title from filename if empty
        if (!title && asset.name) {
          const cleanName = asset.name.replace(/\.[^/.]+$/, '');
          setTitle(cleanName);
        }
      }
    } catch (e: any) {
      Alert.alert('Error selecting audio file', e.message);
    }
  };

  const handlePickLyricsFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        setLyricsFileName(asset.name || 'Selected Lyrics File');

        // Read file content
        const response = await fetch(asset.uri);
        const textContent = await response.text();
        setPlainLyrics(textContent);
      }
    } catch (e: any) {
      Alert.alert('Error reading lyrics file', e.message);
    }
  };

  const handleCreateTrack = async () => {
    const finalAudioUri = audioType === 'url' ? audioUrlInput.trim() : audioUri;

    if (!title.trim() || !artist.trim()) {
      Alert.alert('Missing Fields', 'Please enter track title and artist name.');
      return;
    }

    if (!finalAudioUri) {
      Alert.alert('Missing Audio', 'Please provide an audio URL or select an audio file.');
      return;
    }

    if (!plainLyrics.trim()) {
      Alert.alert('Missing Lyrics', 'Please enter or pick a lyrics file.');
      return;
    }

    try {
      const trackId = `track-${Date.now()}`;
      const now = Date.now();

      // Parse lyrics (handles plain text and .lrc timestamps)
      const parsedRaw = parseLyricsDocument(plainLyrics);

      const parsedLines: LyricLine[] = parsedRaw.map((raw, idx) => {
        const lineId = `line-${trackId}-${idx}`;
        const lineText = raw.text || '';
        const startMs = typeof raw.startMs === 'number' && !isNaN(raw.startMs) ? raw.startMs : 0;
        const endMs = typeof raw.endMs === 'number' && !isNaN(raw.endMs) ? raw.endMs : 0;

        const words = lineText
          .split(/\s+/)
          .filter((w) => w.length > 0)
          .map((wordText, wIdx) => ({
            id: `word-${lineId}-${wIdx}`,
            lineId,
            text: wordText || '',
            startMs,
            endMs,
          }));

        return {
          id: lineId,
          trackId,
          text: lineText,
          startMs,
          endMs,
          words,
        };
      });

      const hasLrcTimestamps = parsedLines.some((l) => l.startMs > 0);

      const newTrack: Track = {
        id: trackId,
        title: title.trim(),
        artist: artist.trim(),
        audioUri: finalAudioUri,
        coverUri: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400',
        durationMs: 180000,
        syncStatus: hasLrcTimestamps ? 'line_synced' : 'draft',
        createdAt: now,
        updatedAt: now,
      };

      // Save safely to SQLite database
      await createTrack(newTrack, parsedLines);

      // Update global Zustand store
      setActiveTrack(newTrack, parsedLines);

      Alert.alert(
        'Track Imported',
        `"${newTrack.title}" imported with ${parsedLines.length} lines of lyrics! Ready to sync.`
      );
      onClose();
    } catch (e: any) {
      console.error('Import track error:', e);
      Alert.alert('Import Failed', e.message || String(e));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Import Audio & Lyrics</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.form}>
          <Text style={styles.label}>1. Audio Source</Text>
          <View style={styles.tabToggle}>
            <TouchableOpacity
              style={[styles.tabBtn, audioType === 'url' && styles.tabBtnActive]}
              onPress={() => setAudioType('url')}
            >
              <Text style={[styles.tabText, audioType === 'url' && styles.tabTextActive]}>
                🔗 Paste Audio URL
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, audioType === 'file' && styles.tabBtnActive]}
              onPress={() => setAudioType('file')}
            >
              <Text style={[styles.tabText, audioType === 'file' && styles.tabTextActive]}>
                📂 Pick File (.m4a/.mp3)
              </Text>
            </TouchableOpacity>
          </View>

          {audioType === 'url' ? (
            <TextInput
              style={styles.input}
              placeholder="https://example.com/audio.mp3"
              placeholderTextColor="#666666"
              value={audioUrlInput}
              onChangeText={(val) => {
                setAudioUrlInput(val);
                if (!title && val.includes('/')) {
                  const filename = val.split('/').pop()?.split('?')[0] || '';
                  if (filename) setTitle(filename.replace(/\.[^/.]+$/, ''));
                }
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : (
            <TouchableOpacity style={styles.filePickerBtn} onPress={handlePickAudio}>
              <Text style={styles.filePickerText}>
                {audioFileName ? `🎵 ${audioFileName}` : '📂 Choose Audio File from Device'}
              </Text>
            </TouchableOpacity>
          )}

          <Text style={styles.label}>Track Title</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Lonely Spider"
            placeholderTextColor="#666666"
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Artist Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Rhymes Studio"
            placeholderTextColor="#666666"
            value={artist}
            onChangeText={setArtist}
          />

          <View style={styles.lyricsHeaderRow}>
            <Text style={styles.label}>2. Lyrics Content</Text>
            <TouchableOpacity style={styles.pickDocBtn} onPress={handlePickLyricsFile}>
              <Text style={styles.pickDocText}>
                {lyricsFileName ? `📄 ${lyricsFileName}` : '📂 Pick Lyrics File (.txt/.lrc)'}
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            numberOfLines={10}
            placeholder={`Paste plain lyrics or LRC file content here...\n\nIn a cave there lived a spider\nHe liked to drink warm apple cider\nHe liked to think about his life\nHe wondered if he’d ever have a wife\nLonely spider.`}
            placeholderTextColor="#666666"
            value={plainLyrics}
            onChangeText={setPlainLyrics}
          />

          <TouchableOpacity style={styles.submitBtn} onPress={handleCreateTrack}>
            <Text style={styles.submitText}>Create Track & Start Syncing</Text>
          </TouchableOpacity>
        </ScrollView>
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
    fontSize: 18,
    fontWeight: '800',
  },
  closeText: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  form: {
    padding: 20,
  },
  label: {
    color: '#AAAAAA',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  tabToggle: {
    flexDirection: 'row',
    backgroundColor: '#161922',
    borderRadius: 8,
    padding: 4,
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabBtnActive: {
    backgroundColor: '#00E5FF',
  },
  tabText: {
    color: '#888888',
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#000000',
  },
  input: {
    backgroundColor: '#161922',
    color: '#FFFFFF',
    fontSize: 16,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#242A38',
  },
  textArea: {
    height: 160,
    textAlignVertical: 'top',
  },
  filePickerBtn: {
    backgroundColor: '#1A2234',
    borderWidth: 1,
    borderColor: '#00E5FF',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  filePickerText: {
    color: '#00E5FF',
    fontWeight: '700',
    fontSize: 15,
  },
  lyricsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  pickDocBtn: {
    backgroundColor: '#1E2430',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  pickDocText: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#00E5FF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  submitText: {
    color: '#000000',
    fontWeight: '900',
    fontSize: 16,
  },
});
