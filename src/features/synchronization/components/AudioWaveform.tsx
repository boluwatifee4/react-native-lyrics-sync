import React, { useState } from 'react';
import { View, StyleSheet, Text, Pressable, LayoutChangeEvent } from 'react-native';

interface AudioWaveformProps {
  positionMs: number;
  durationMs: number;
  height?: number;
  onSeekRequested?: (ms: number) => void;
}

// Generate realistic pseudo-amplitude waveform bars
const SAMPLE_BARS = [
  0.2, 0.4, 0.6, 0.8, 0.5, 0.3, 0.7, 0.9, 1.0, 0.8, 0.6, 0.4, 0.2, 0.5, 0.8, 0.6,
  0.3, 0.7, 0.9, 0.5, 0.2, 0.6, 0.8, 0.7, 0.4, 0.9, 1.0, 0.6, 0.3, 0.5, 0.8, 0.4,
  0.2, 0.6, 0.9, 0.7, 0.5, 0.8, 0.4, 0.2, 0.6, 0.9, 0.8, 0.5, 0.3, 0.7, 0.9, 0.6,
];

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  positionMs,
  durationMs,
  height = 48,
  onSeekRequested,
}) => {
  const [containerWidth, setContainerWidth] = useState(0);

  const progressRatio = durationMs > 0 ? Math.min(1.0, positionMs / durationMs) : 0;
  const activeBarIndex = Math.floor(progressRatio * SAMPLE_BARS.length);

  const formatMs = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
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
      <Pressable
        onLayout={handleLayout}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.waveformBox,
          { height },
          pressed && styles.waveformBoxPressed,
        ]}
        hitSlop={4}
      >
        {SAMPLE_BARS.map((amp, idx) => {
          const isPassed = idx <= activeBarIndex;
          const isCurrent = idx === activeBarIndex;

          return (
            <View
              key={idx}
              style={[
                styles.bar,
                {
                  height: `${Math.max(15, amp * 100)}%`,
                  backgroundColor: isCurrent
                    ? '#00E5FF'
                    : isPassed
                    ? '#38BDF8'
                    : '#262C3A',
                },
              ]}
            />
          );
        })}

        {/* Playhead line */}
        <View style={[styles.playheadLine, { left: `${progressRatio * 100}%` }]} />
      </Pressable>

      {/* Time labels */}
      <View style={styles.timeRow}>
        <Text style={styles.timeLabel}>{formatMs(positionMs)}</Text>
        <Text style={[styles.timeLabel, onSeekRequested && styles.timeHint]}>
          {onSeekRequested ? '⇠ tap to seek ⇢' : formatMs(durationMs)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#12151E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222834',
  },
  waveformBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  waveformBoxPressed: {
    opacity: 0.6,
  },
  bar: {
    flex: 1,
    marginHorizontal: 1,
    borderRadius: 2,
  },
  playheadLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeLabel: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timeHint: {
    color: '#00E5FF',
  },
});