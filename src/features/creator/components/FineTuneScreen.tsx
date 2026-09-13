import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LyricLine } from '../../../domain/lyrics';

interface FineTuneScreenProps {
  visible: boolean;
  onClose: () => void;
  lines: LyricLine[];
  currentMs: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (ms: number) => void;
  onNudgeLine: (lineIndex: number, deltaMs: number) => void;
  onNudgeWord: (lineIndex: number, wordIndex: number, deltaMs: number) => void;
}

const formatMs = (ms: number) => {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

const NudgeButton: React.FC<{ value: number; color?: string; onPress: () => void }> = ({
  value,
  color,
  onPress,
}) => (
  <TouchableOpacity
    style={[styles.nudgeBtn, color ? { backgroundColor: color } : null]}
    onPress={onPress}
  >
    <Text style={styles.nudgeBtnText}>{value > 0 ? `+${value}` : value}</Text>
  </TouchableOpacity>
);

const NudgeGroup: React.FC<{ onNudge: (deltaMs: number) => void }> = ({ onNudge }) => (
  <View style={styles.nudgeGroup}>
    <NudgeButton value={-100} color="#232B3A" onPress={() => onNudge(-100)} />
    <NudgeButton value={-10} color="#232B3A" onPress={() => onNudge(-10)} />
    <NudgeButton value={10} color="#0D3B3F" onPress={() => onNudge(10)} />
    <NudgeButton value={100} color="#0D3B3F" onPress={() => onNudge(100)} />
  </View>
);

export const FineTuneScreen: React.FC<FineTuneScreenProps> = ({
  visible,
  onClose,
  lines,
  currentMs,
  isPlaying,
  onPlayPause,
  onSeek,
  onNudgeLine,
  onNudgeWord,
}) => {
  const [expandedLine, setExpandedLine] = useState<number | null>(null);

  const renderLine = ({ item, index }: { item: LyricLine; index: number }) => {
    const expanded = expandedLine === index;

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => setExpandedLine(expanded ? null : index)}
        >
          <View style={styles.cardIcon}>
            <Ionicons
              name={item.startMs > 0 ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={item.startMs > 0 ? '#10B981' : '#333A4A'}
            />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardLineNo} numberOfLines={1}>
              Line {index + 1}
            </Text>
            <Text style={styles.cardText} numberOfLines={1}>
              {item.text}
            </Text>
            <Text style={styles.cardTimestamp}>
              {item.startMs > 0 ? `${formatMs(item.startMs)} → ${formatMs(item.endMs)}` : 'not synced'}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#888888"
          />
        </TouchableOpacity>

        {expanded && (
          <View style={styles.cardBody}>
            {/* Per-line nudge */}
            <View style={styles.bodyRow}>
              <Text style={styles.bodyLabel}>Line ±ms</Text>
              <NudgeGroup onNudge={(delta) => onNudgeLine(index, delta)} />
            </View>

            {/* Seek to line */}
            {item.startMs > 0 && (
              <TouchableOpacity style={styles.seekBtn} onPress={() => onSeek(item.startMs)}>
                <Ionicons name="play-skip-forward-outline" size={14} color="#00E5FF" />
                <Text style={styles.seekBtnText}>Listen to this line</Text>
              </TouchableOpacity>
            )}

            {/* Per-word nudge */}
            {item.words.length > 0 && (
              <View style={styles.wordList}>
                <Text style={styles.wordListTitle}>Words</Text>
                {item.words.map((word, wi) => (
                  <View key={word.id} style={styles.wordRow}>
                    <View style={styles.wordInfo}>
                      <Text style={styles.wordText} numberOfLines={1}>
                        {word.text}
                      </Text>
                      <Text style={styles.wordTimestamp}>
                        {word.startMs > 0 ? `${formatMs(word.startMs)} → ${formatMs(word.endMs)}` : '—'}
                      </Text>
                    </View>
                    <View style={styles.wordNudgeWrap}>
                      <NudgeButton value={-10} color="#232B3A" onPress={() => onNudgeWord(index, wi, -10)} />
                      <NudgeButton value={10} color="#0D3B3F" onPress={() => onNudgeWord(index, wi, 10)} />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Fine Tune</Text>
            <Text style={styles.headerSub}>
              Nudge each line or word by ±10 / ±100 ms
            </Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Transport strip */}
        <View style={styles.transport}>
          <Text style={styles.transportTime}>{formatMs(currentMs)}</Text>
          <TouchableOpacity style={styles.playBtn} onPress={onPlayPause}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#000000" />
          </TouchableOpacity>
          <Text style={styles.transportHint}>Tap a line to tune it</Text>
        </View>

        {/* Lines list */}
        <FlatList
          data={lines}
          keyExtractor={(item) => item.id}
          renderItem={renderLine}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0C10',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1D27',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  headerSub: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: '#1E2430',
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1D27',
  },
  transportTime: {
    color: '#00E5FF',
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    width: 56,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transportHint: {
    color: '#555555',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#12151E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222834',
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardIcon: {
    width: 30,
    alignItems: 'center',
    marginRight: 8,
  },
  cardTextWrap: {
    flex: 1,
  },
  cardLineNo: {
    color: '#555555',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  cardTimestamp: {
    color: '#10B98180',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  cardBody: {
    borderTopWidth: 1,
    borderTopColor: '#1A1D27',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  bodyLabel: {
    color: '#AAAAAA',
    fontSize: 12,
    fontWeight: '700',
  },
  nudgeGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  nudgeBtn: {
    minWidth: 44,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A4356',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  nudgeBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  seekBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#0D1A26',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    marginBottom: 12,
  },
  seekBtnText: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '700',
  },
  wordList: {
    borderTopWidth: 1,
    borderTopColor: '#222834',
    paddingTop: 10,
  },
  wordListTitle: {
    color: '#555555',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  wordInfo: {
    flex: 1,
  },
  wordText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  wordTimestamp: {
    color: '#888888',
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  wordNudgeWrap: {
    flexDirection: 'row',
    gap: 6,
  },
});