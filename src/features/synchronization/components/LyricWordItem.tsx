import React, { memo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { LyricWord } from '../../../domain/lyrics';
import {
  WORD_COLOR_S_STOPS,
  WORD_COLOR_STOPS,
  WORD_FLAME_COLOR_STOPS,
  WORD_FLAME_OPACITY_STOPS,
  WORD_FLAME_S_STOPS,
  WORD_OPACITY_STOPS,
  computeWordEnergy,
} from './lyricMotion';

interface LyricWordItemProps {
  word: LyricWord;
  timeMs: SharedValue<number>;
}

export const LyricWordItem: React.FC<LyricWordItemProps> = memo(({ word, timeMs }) => {
  const isSynced = word.startMs > 0 || word.endMs > 0;

  if (!isSynced) {
    return (
      <View style={styles.wordWrapper}>
        <Text style={styles.staticWordText}>{word.text}</Text>
        <Text style={styles.staticWordText}> </Text>
      </View>
    );
  }

  return <SyncedLyricWordItem word={word} timeMs={timeMs} />;
});

const SyncedLyricWordItem: React.FC<LyricWordItemProps> = memo(({ word, timeMs }) => {
  const flameBodyStyle = useAnimatedStyle(() => {
    const t = timeMs.value;
    const s = computeWordEnergy(t, word.startMs, word.endMs);
    const isActive = s > -0.2 && s < 1.6;

    if (!isActive) {
      return { opacity: 0 };
    }

    const scale = interpolate(s, [-0.2, 0.5, 1.5], [0.85, 1.05, 0.9], Extrapolation.CLAMP);

    return {
      opacity: interpolate(s, WORD_FLAME_S_STOPS, WORD_FLAME_OPACITY_STOPS, Extrapolation.CLAMP),
      backgroundColor: interpolateColor(
        s,
        WORD_FLAME_S_STOPS,
        WORD_FLAME_COLOR_STOPS,
        'RGB'
      ) as string,
      transform: [{ scale }],
    };
  });

  const textStyle = useAnimatedStyle(() => {
    const s = computeWordEnergy(timeMs.value, word.startMs, word.endMs);
    return {
      opacity: interpolate(s, [-1, 0, 1, 2], WORD_OPACITY_STOPS, Extrapolation.CLAMP),
      color: interpolateColor(s, WORD_COLOR_S_STOPS, WORD_COLOR_STOPS, 'RGB') as string,
      transform: [
        { scale: interpolate(s, [-0.6, 0.05, 0.7], [1, 1.03, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <View style={styles.wordWrapper}>
      <Animated.View pointerEvents="none" style={[styles.flameBody, flameBodyStyle]} />
      <Animated.Text style={[styles.wordText, textStyle]}>{word.text}</Animated.Text>
      <Animated.Text style={[styles.wordSpace, textStyle]}> </Animated.Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wordWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 1,
    overflow: 'visible',
  },
  flameBody: {
    position: 'absolute',
    left: -4,
    right: -4,
    top: 4,
    bottom: 4,
    borderRadius: 6,
    zIndex: 0,
  },
  wordText: {
    fontSize: 22,
    fontWeight: '500',
    letterSpacing: -0.2,
    lineHeight: 34,
    zIndex: 1,
  },
  wordSpace: {
    fontSize: 22,
    lineHeight: 34,
    zIndex: 1,
  },
  staticWordText: {
    fontSize: 22,
    fontWeight: '500',
    letterSpacing: -0.2,
    lineHeight: 34,
    color: '#9CA3AF',
  },
});
