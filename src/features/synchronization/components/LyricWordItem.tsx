import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, interpolate, Extrapolation, type SharedValue } from 'react-native-reanimated';
import { LyricWord } from '../../../domain/lyrics';

interface LyricWordItemProps {
  word: LyricWord;
  timeMs: SharedValue<number>;
  isActiveLine: boolean;
}

export const LyricWordItem: React.FC<LyricWordItemProps> = ({ word, timeMs, isActiveLine }) => {
  const animatedStyle = useAnimatedStyle(() => {
    if (!isActiveLine) {
      return {
        opacity: 0.35,
        color: '#666666',
        transform: [{ scale: 1 }],
      };
    }

    const progress = interpolate(
      timeMs.value,
      [word.startMs, word.endMs],
      [0, 1],
      Extrapolation.CLAMP
    );

    const isPast = timeMs.value > word.endMs;
    const isCurrent = timeMs.value >= word.startMs && timeMs.value <= word.endMs;

    return {
      opacity: isCurrent ? 1.0 : isPast ? 0.85 : 0.4,
      color: isCurrent ? '#00E5FF' : isPast ? '#FFFFFF' : '#888888',
      transform: [
        {
          scale: interpolate(
            progress,
            [0, 0.5, 1],
            [1.0, 1.08, 1.0],
            Extrapolation.CLAMP
          ),
        },
      ],
    };
  });

  return (
    <Animated.Text style={[styles.wordText, animatedStyle]}>
      {word.text}{' '}
    </Animated.Text>
  );
};

const styles = StyleSheet.create({
  wordText: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
