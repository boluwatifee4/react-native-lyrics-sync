import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { createTrack } from '../../../services/db';
import { usePlayerStore } from '../../player/store/usePlayerStore';
import { Track, LyricLine } from '../../../domain/lyrics';
import { parseLyricsDocument } from '../../../domain/timelineEngine';
import { Colors } from '../../../constants/theme';

interface ImportTrackModalProps {
  visible: boolean;
  onClose: () => void;
  onImportComplete?: (trackId: string) => void;
}

export const ImportTrackModal: React.FC<ImportTrackModalProps> = ({
  visible,
  onClose,
  onImportComplete,
}) => {
  const insets = useSafeAreaInsets();
  const [audioType, setAudioType] = useState<'url' | 'file'>('url');
  const [audioUrlInput, setAudioUrlInput] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [lyricsFileName, setLyricsFileName] = useState<string | null>(null);
  const [plainLyrics, setPlainLyrics] = useState('');
  const setActiveTrack = usePlayerStore((s) => s.setActiveTrack);
  const theme = Colors.dark;

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
      Alert.alert('Audio selection error', e.message);
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

        const response = await fetch(asset.uri);
        const textContent = await response.text();
        setPlainLyrics(textContent);
      }
    } catch (e: any) {
      Alert.alert('Lyrics file error', e.message);
    }
  };

  const handleCreateTrack = async () => {
    const finalAudioUri = audioType === 'url' ? audioUrlInput.trim() : audioUri;

    if (!title.trim() || !artist.trim()) {
      Alert.alert('INCOMPLETE TELEMETRY', 'Please specify both track title and artist.');
      return;
    }

    if (!finalAudioUri) {
      Alert.alert('MISSING AUDIO SOURCE', 'Provide an audio stream URL or choose an audio file.');
      return;
    }

    if (!plainLyrics.trim()) {
      Alert.alert('MISSING LYRICS', 'Please input or ingest lyric content.');
      return;
    }

    try {
      const trackId = `track-${Date.now()}`;
      const now = Date.now();

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

      await createTrack(newTrack, parsedLines);
      setActiveTrack(newTrack, parsedLines);

      Alert.alert(
        'INGESTION COMPLETE',
        `"${newTrack.title}" successfully ingested with ${parsedLines.length} lines.`
      );
      if (onImportComplete) {
        onImportComplete(newTrack.id);
      } else {
        onClose();
      }
    } catch (e: any) {
      console.error('Import track error:', e);
      Alert.alert('Ingestion Failed', e.message || String(e));
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
        {/* ─── WORKFLOW TITLEBAR ─── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerLabel}>INGESTION PIPELINE</Text>
            <Text style={styles.headerTitle}>Import Audio & Lyrics</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={20} color="#F4F4F5" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 20) + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* ─── STEP 01: AUDIO SOURCE ─── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionStep}>01</Text>
              <Text style={styles.sectionName}>AUDIO SOURCE INGESTION</Text>
            </View>

            {/* Source Segment Selector */}
            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[styles.segmentBtn, audioType === 'url' && styles.segmentBtnActive]}
                onPress={() => setAudioType('url')}
              >
                <Text style={[styles.segmentText, audioType === 'url' && styles.segmentTextActive]}>
                  STREAM URL
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentBtn, audioType === 'file' && styles.segmentBtnActive]}
                onPress={() => setAudioType('file')}
              >
                <Text style={[styles.segmentText, audioType === 'file' && styles.segmentTextActive]}>
                  LOCAL FILE
                </Text>
              </TouchableOpacity>
            </View>

            {audioType === 'url' ? (
              <TextInput
                style={styles.textInput}
                placeholder="https://domain.com/audio-stream.mp3"
                placeholderTextColor="#3F3F46"
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
              <TouchableOpacity style={styles.fileTrigger} onPress={handlePickAudio}>
                <Ionicons name="document-attach-outline" size={16} color={theme.accent} />
                <Text style={styles.fileTriggerText} numberOfLines={1}>
                  {audioFileName ? audioFileName : 'SELECT AUDIO FILE (.MP3 / .M4A)'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ─── STEP 02: TRACK METADATA ─── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionStep}>02</Text>
              <Text style={styles.sectionName}>TRACK METADATA</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>TRACK TITLE</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Starship Flight 4"
                placeholderTextColor="#3F3F46"
                value={title}
                onChangeText={setTitle}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>ARTIST / COMPOSER</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Flight Telemetry"
                placeholderTextColor="#3F3F46"
                value={artist}
                onChangeText={setArtist}
              />
            </View>
          </View>

          {/* ─── STEP 03: LYRIC PAYLOAD ─── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.sectionStep}>03</Text>
                <Text style={styles.sectionName}>LYRIC TELEMETRY PAYLOAD</Text>
              </View>
              <TouchableOpacity
                style={styles.ingestDocBtn}
                onPress={handlePickLyricsFile}
                hitSlop={6}
              >
                <Ionicons name="document-text-outline" size={12} color={theme.accent} />
                <Text style={styles.ingestDocText}>
                  {lyricsFileName ? 'FILE ATTACHED' : 'LOAD .LRC/.TXT'}
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.textInput, styles.textArea]}
              multiline
              numberOfLines={8}
              placeholder={`Paste plain lyric text or LRC timecoded payload...\n\n[00:01.20] In a cave there lived a spider\n[00:04.80] He liked to drink warm apple cider`}
              placeholderTextColor="#3F3F46"
              value={plainLyrics}
              onChangeText={setPlainLyrics}
            />
          </View>

          {/* ─── SUBMIT ACTION ─── */}
          <TouchableOpacity style={styles.submitBtn} onPress={handleCreateTrack} activeOpacity={0.8}>
            <Ionicons name="cloud-upload-outline" size={18} color="#000000" />
            <Text style={styles.submitText}>INITIALIZE TRACK & SYNCHRONIZER</Text>
          </TouchableOpacity>
        </ScrollView>
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
  closeBtn: {
    padding: 6,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#121214',
    paddingBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionStep: {
    color: '#3E9BFF',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginRight: 6,
  },
  sectionName: {
    color: '#A1A1AA',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.0,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#08080A',
    borderWidth: 1,
    borderColor: '#18181B',
    borderRadius: 2,
    marginBottom: 10,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#121216',
  },
  segmentText: {
    color: '#52525B',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  segmentTextActive: {
    color: '#3E9BFF',
  },
  textInput: {
    backgroundColor: '#08080A',
    color: '#F4F4F5',
    fontSize: 13,
    borderRadius: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#18181B',
  },
  textArea: {
    height: 140,
    textAlignVertical: 'top',
    fontVariant: ['tabular-nums'],
    fontSize: 12,
    lineHeight: 18,
  },
  fileTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#08080A',
    borderWidth: 1,
    borderColor: '#18181B',
    borderRadius: 2,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 8,
  },
  fileTriggerText: {
    color: '#3E9BFF',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  inputGroup: {
    marginTop: 10,
  },
  fieldLabel: {
    color: '#52525B',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  ingestDocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ingestDocText: {
    color: '#3E9BFF',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F5',
    borderRadius: 2,
    paddingVertical: 16,
    marginTop: 8,
    gap: 8,
  },
  submitText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.8,
  },
});
