import React, { useState } from 'react';
import { View, StyleSheet, Text, Pressable, LayoutChangeEvent } from 'react-native';
import { Colors } from '../../../constants/theme';

interface AudioWaveformProps {
  positionMs: number;
  durationMs: number;
  height?: number;
  onSeekRequested?: (ms: number) => void;
}

// 48-point acoustic telemetry waveform pattern
const SAMPLE_BARS = [
  0.22, 0.38, 0.65, 0.82, 0.48, 0.32, 0.72, 0.94, 1.0, 0.85, 0.62, 0.44, 0.25, 0.55, 0.88, 0.64,
  0.35, 0.76, 0.92, 0.58, 0.24, 0.66, 0.84, 0.72, 0.42, 0.90, 0.98, 0.68, 0.34, 0.52, 0.82, 0.45,
  0.28, 0.64, 0.91, 0.75, 0.50, 0.84, 0.46, 0.22, 0.60, 0.95, 0.82, 0.54, 0.30, 0.68, 0.89, 0.58,
];

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  positionMs,
  durationMs,
  height = 42,
  onSeekRequested,
}) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const theme = Colors.dark;

  const progressRatio = durationMs > 0 ? Math.min(1.0, positionMs / durationMs) : 0;
  const activeBarIndex = Math.floor(progressRatio * SAMPLE_BARS.length);

  const formatPreciseMs = (ms: number) => {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const millis = Math.floor((Math.max(0, ms) % 1000) / 100);
    return `${min}:${sec.toString().padStart(2, '0')}.${millis}`;
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  const handlePress = (e: any) => {
    if (!onSeekRequested || containerWidth <= 0) return;
    const ratio = Math.min(1, Math.max(0, e.nativeEvent.locationX / containerWidth));
    onSeekRequested(Math.floor(ratio * durationMs));
  };

  return (
    <View style={styles.container}>
      {/* Top telemetry rule & tick marks */}
      <View style={styles.rulerContainer}>
        <View style={styles.tickMark} />
        <View style={[styles.tickMark, styles.tickSubtle]} />
        <View style={[styles.tickMark, styles.tickSubtle]} />
        <View style={styles.tickMark} />
        <View style={[styles.tickMark, styles.tickSubtle]} />
        <View style={[styles.tickMark, styles.tickSubtle]} />
        <View style={styles.tickMark} />
      </View>

      <Pressable
        onLayout={handleLayout}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.waveformTrack,
          { height },
          pressed && styles.waveformPressed,
        ]}
        hitSlop={6}
      >
        {SAMPLE_BARS.map((amp, idx) => {
          const isPassed = idx < activeBarIndex;
          const isCurrent = idx === activeBarIndex;

          return (
            <View
              key={idx}
              style={[
                styles.bar,
                {
                  height: `${Math.max(12, amp * 100)}%`,
                  backgroundColor: isCurrent
                    ? theme.accent
                    : isPassed
                    ? theme.textSecondary
                    : theme.hairline,
                },
              ]}
            />
          );
        })}

        {/* Razor playhead line */}
        <View
          style={[
            styles.playheadLine,
            { left: `${progressRatio * 100}%` },
          ]}
        />
      </Pressable>

      {/* Instrumentation Timecode Readout */}
      <View style={styles.timeRow}>
        <View style={styles.readoutGroup}>
          <Text style={styles.readoutLabel}>ELAPSED</Text>
          <Text style={styles.timeLabel}>{formatPreciseMs(positionMs)}</Text>
        </View>

        {onSeekRequested && (
          <Text style={styles.seekHint}>TAP TIMELINE TO SEEK</Text>
        )}

        <View style={[styles.readoutGroup, { alignItems: 'flex-end' }]}>
          <Text style={styles.readoutLabel}>TOTAL</Text>
          <Text style={styles.timeLabel}>{formatPreciseMs(durationMs)}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  rulerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  tickMark: {
    width: 1,
    height: 4,
    backgroundColor: '#27272A',
  },
  tickSubtle: {
    height: 2,
    backgroundColor: '#18181B',
  },
  waveformTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  waveformPressed: {
    opacity: 0.7,
  },
  bar: {
    flex: 1,
    marginHorizontal: 1,
    borderRadius: 1,
  },
  playheadLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: '#3E9BFF',
    shadowColor: '#3E9BFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  readoutGroup: {
    gap: 1,
  },
  readoutLabel: {
    color: '#52525B',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  timeLabel: {
    color: '#A1A1AA',
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  seekHint: {
    color: '#3F3F46',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.0,
  },
});