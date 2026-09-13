import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LyricLine } from '../../../domain/lyrics';
import { Colors } from '../../../constants/theme';

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

const formatPreciseMs = (ms: number) => {
  const safeMs = Math.max(0, ms);
  const totalSec = Math.floor(safeMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const millis = Math.floor((safeMs % 1000) / 10).toString().padStart(2, '0');
  return `${min}:${sec.toString().padStart(2, '0')}.${millis}`;
};

const StepperBtn: React.FC<{ value: number; onPress: () => void }> = ({ value, onPress }) => (
  <TouchableOpacity
    style={styles.stepperBtn}
    onPress={onPress}
    hitSlop={4}
    activeOpacity={0.6}
  >
    <Text style={styles.stepperBtnText}>{value > 0 ? `+${value}` : `${value}`}</Text>
  </TouchableOpacity>
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
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const theme = Colors.dark;

  const renderItem = ({ item, index }: { item: LyricLine; index: number }) => {
    const isExpanded = expandedIndex === index;
    const isSynced = item.startMs > 0;
    const isPlaybackActive = currentMs >= item.startMs && currentMs <= item.endMs && isSynced;

    return (
      <View style={[styles.tableRow, isPlaybackActive && styles.tableRowPlaybackActive]}>
        {/* Row Header / Main Strip */}
        <TouchableOpacity
          style={styles.rowMain}
          onPress={() => setExpandedIndex(isExpanded ? null : index)}
          activeOpacity={0.7}
        >
          {/* Index & Sync status indicator */}
          <View style={styles.indexCol}>
            <Text style={[styles.indexText, isPlaybackActive && styles.indexTextActive]}>
              {(index + 1).toString().padStart(2, '0')}
            </Text>
            <View
              style={[
                styles.statusDot,
                isSynced ? styles.statusDotSynced : styles.statusDotUnsynced,
                isPlaybackActive && styles.statusDotLive,
              ]}
            />
          </View>

          {/* Line text & timecode readout */}
          <View style={styles.contentCol}>
            <Text
              style={[
                styles.lineText,
                isPlaybackActive ? styles.lineTextLive : isSynced ? styles.lineTextSynced : styles.lineTextUnsynced,
              ]}
              numberOfLines={isExpanded ? undefined : 1}
            >
              {item.text}
            </Text>

            <View style={styles.timecodeRow}>
              <Text style={styles.timecodeLabel}>TC</Text>
              <Text style={[styles.timecodeValue, isSynced && styles.timecodeValueSynced]}>
                {isSynced
                  ? `${formatPreciseMs(item.startMs)} ➔ ${formatPreciseMs(item.endMs)}`
                  : '00:00.00 ➔ 00:00.00'}
              </Text>
            </View>
          </View>

          {/* Expand / Inspect indicator */}
          <View style={styles.actionCol}>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={isExpanded ? theme.accent : '#52525B'}
            />
          </View>
        </TouchableOpacity>

        {/* ─── INSTRUMENT INSPECTION DRAWER ─── */}
        {isExpanded && (
          <View style={styles.inspectorDrawer}>
            {/* Quick transport seek */}
            <View style={styles.drawerSection}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerSectionTitle}>LINE TIMING CALIBRATION</Text>
                {isSynced && (
                  <TouchableOpacity
                    style={styles.listenBtn}
                    onPress={() => onSeek(item.startMs)}
                    hitSlop={6}
                  >
                    <Ionicons name="play" size={10} color={theme.accent} />
                    <Text style={styles.listenBtnText}>PLAY FROM LINE</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Monospace Stepper Controls */}
              <View style={styles.stepperGroup}>
                <StepperBtn value={-100} onPress={() => onNudgeLine(index, -100)} />
                <StepperBtn value={-10} onPress={() => onNudgeLine(index, -10)} />
                <StepperBtn value={10} onPress={() => onNudgeLine(index, 10)} />
                <StepperBtn value={100} onPress={() => onNudgeLine(index, 100)} />
              </View>
            </View>

            {/* Word-level timing telemetry (if present) */}
            {item.words && item.words.length > 0 && (
              <View style={[styles.drawerSection, styles.drawerSectionBorder]}>
                <Text style={styles.drawerSectionTitle}>WORD TELEMETRY</Text>
                {item.words.map((word, wi) => (
                  <View key={word.id} style={styles.wordTelemetryRow}>
                    <View style={styles.wordDetails}>
                      <Text style={styles.wordName} numberOfLines={1}>
                        {word.text}
                      </Text>
                      <Text style={styles.wordTimecode}>
                        {word.startMs > 0 ? formatPreciseMs(word.startMs) : '--:--.--'}
                      </Text>
                    </View>

                    <View style={styles.wordSteppers}>
                      <StepperBtn value={-10} onPress={() => onNudgeWord(index, wi, -10)} />
                      <StepperBtn value={10} onPress={() => onNudgeWord(index, wi, 10)} />
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
        {/* ─── WORKSTATION TITLEBAR ─── */}
        <View style={styles.titleBar}>
          <View style={styles.titleInfo}>
            <Text style={styles.stationLabel}>WORKSTATION // CALIBRATION</Text>
            <Text style={styles.stationTitle}>Fine Tune Synchronization</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={20} color="#F4F4F5" />
          </TouchableOpacity>
        </View>

        {/* ─── LIVE TRANSPORT TELEMETRY STRIP ─── */}
        <View style={styles.transportTelemetry}>
          <TouchableOpacity style={styles.transportPlayBtn} onPress={onPlayPause} hitSlop={6}>
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={16}
              color={theme.accent}
              style={{ marginLeft: isPlaying ? 0 : 2 }}
            />
          </TouchableOpacity>

          <View style={styles.liveClockGroup}>
            <Text style={styles.liveClockLabel}>CURRENT TIMECODE</Text>
            <Text style={styles.liveClockValue}>{formatPreciseMs(currentMs)}</Text>
          </View>

          <View style={styles.transportLegend}>
            <Text style={styles.legendText}>TAP ROW TO EXPAND STEPPER</Text>
          </View>
        </View>

        {/* ─── INSTRUMENT PANEL TABLE ─── */}
        <FlatList
          data={lines}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.tableList}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  titleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  titleInfo: {
    flex: 1,
  },
  stationLabel: {
    color: '#52525B',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  stationTitle: {
    color: '#F4F4F5',
    fontSize: 16,
    fontWeight: '500',
  },
  closeBtn: {
    padding: 6,
  },
  transportTelemetry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#08080A',
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
    gap: 14,
  },
  transportPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveClockGroup: {
    gap: 1,
  },
  liveClockLabel: {
    color: '#52525B',
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  liveClockValue: {
    color: '#3E9BFF',
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  transportLegend: {
    flex: 1,
    alignItems: 'flex-end',
  },
  legendText: {
    color: '#3F3F46',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  tableList: {
    paddingVertical: 8,
  },
  tableRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#121214',
  },
  tableRowPlaybackActive: {
    backgroundColor: '#0A0A10',
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  indexCol: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 36,
    gap: 6,
  },
  indexText: {
    color: '#3F3F46',
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  indexTextActive: {
    color: '#3E9BFF',
  },
  statusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  statusDotSynced: {
    backgroundColor: '#30D158',
  },
  statusDotUnsynced: {
    backgroundColor: '#27272A',
  },
  statusDotLive: {
    backgroundColor: '#3E9BFF',
    shadowColor: '#3E9BFF',
    shadowRadius: 4,
    shadowOpacity: 0.8,
  },
  contentCol: {
    flex: 1,
    paddingRight: 12,
  },
  lineText: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  lineTextLive: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  lineTextSynced: {
    color: '#A1A1AA',
  },
  lineTextUnsynced: {
    color: '#52525B',
  },
  timecodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  timecodeLabel: {
    color: '#3F3F46',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  timecodeValue: {
    color: '#52525B',
    fontSize: 11,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
  timecodeValueSynced: {
    color: '#71717A',
  },
  actionCol: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
  },
  inspectorDrawer: {
    backgroundColor: '#08080A',
    borderTopWidth: 1,
    borderTopColor: '#18181B',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  drawerSection: {
    marginBottom: 8,
  },
  drawerSectionBorder: {
    borderTopWidth: 1,
    borderTopColor: '#121214',
    paddingTop: 12,
    marginTop: 6,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  drawerSectionTitle: {
    color: '#52525B',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.0,
  },
  listenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  listenBtnText: {
    color: '#3E9BFF',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  stepperGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  stepperBtn: {
    flex: 1,
    height: 32,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    color: '#F4F4F5',
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  wordTelemetryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#121214',
  },
  wordDetails: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordName: {
    color: '#F4F4F5',
    fontSize: 13,
    fontWeight: '400',
  },
  wordTimecode: {
    color: '#71717A',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  wordSteppers: {
    flexDirection: 'row',
    gap: 6,
    width: 100,
  },
});