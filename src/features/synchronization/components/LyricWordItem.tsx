import React from 'react';
import { StyleSheet, View } from 'react-native';
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
  WORD_GLOW_COLOR_STOPS,
  WORD_GLOW_RADIUS_STOPS,
  WORD_GLOW_S_STOPS,
  WORD_OPACITY_STOPS,
  computeWordEnergy,
  FLAME_GLOW,
} from './lyricMotion';

// Each flame lick is a thin, irregular tip. No two burn the same way.
const LICKS = [
  // Main — widest, most visible, slow lazy flicker
  {
    width: 14, left: -16,
    topPct: 0.18, bottomPct: 0.22,
    radii: [2, 1, 10, 7] as [number, number, number, number],
    freqY: 0.005, ampY: 2.4, phaseY: 0,
    freqX: 0.008, ampX: 0.9, phaseX: 0.5,
    freqR: 0.006, ampR: 3.5, phaseR: 1.1,
    opacityMul: 0.72, buoyancy: [-0.5, -2, -5.5],
    sClamp: [0.55, 1, 1.06, 0.8],
  },
  // Upper wispy — thinner, slightly faster, positioned above center
  {
    width: 8, left: -12,
    topPct: -0.05, bottomPct: 0.55,
    radii: [1, 1, 7, 4] as [number, number, number, number],
    freqY: 0.009, ampY: 1.8, phaseY: 1.4,
    freqX: 0.011, ampX: 0.6, phaseX: 2.3,
    freqR: 0.010, ampR: 5, phaseR: 3.7,
    opacityMul: 0.5, buoyancy: [0, -3, -7],
    sClamp: [0.4, 1, 1.04, 0.75],
  },
  // Lower wispy — slowest, barely moves, below center
  {
    width: 6, left: -10,
    topPct: 0.6, bottomPct: -0.05,
    radii: [1, 0, 6, 3] as [number, number, number, number],
    freqY: 0.004, ampY: 1.2, phaseY: 2.8,
    freqX: 0.006, ampX: 0.4, phaseX: 4.1,
    freqR: 0.005, ampR: 2.5, phaseR: 5.2,
    opacityMul: 0.42, buoyancy: [0.5, -1.5, -4],
    sClamp: [0.35, 1, 1.03, 0.7],
  },
  // Tip — thin, moderate speed, nearly transparent at the very end
  {
    width: 4, left: -8,
    topPct: 0.35, bottomPct: 0.35,
    radii: [0, 0, 4, 2] as [number, number, number, number],
    freqY: 0.013, ampY: 3.0, phaseY: 4.2,
    freqX: 0.016, ampX: 1.2, phaseX: 5.8,
    freqR: 0.012, ampR: 7, phaseR: 0.7,
    opacityMul: 0.35, buoyancy: [0, -4, -8],
    sClamp: [0.3, 1, 1.02, 0.6],
  },
];

interface LyricWordItemProps {
  word: LyricWord;
  timeMs: SharedValue<number>;
}

export const LyricWordItem: React.FC<LyricWordItemProps> = ({ word, timeMs }) => {
  const flameBodyStyle = useAnimatedStyle(() => {
    const t = timeMs.value;
    const s = computeWordEnergy(t, word.startMs, word.endMs);
    const isActive = s > -0.3 && s < 1.6;

    const breathe = isActive ? 1 + Math.sin(t * 0.004) * 0.04 : 1;
    const wobbleX = isActive ? Math.sin(t * 0.007) * 0.6 : 0;

    return {
      opacity: interpolate(s, WORD_FLAME_S_STOPS, WORD_FLAME_OPACITY_STOPS, Extrapolation.CLAMP),
      backgroundColor: interpolateColor(
        s, WORD_FLAME_S_STOPS, WORD_FLAME_COLOR_STOPS, 'RGB',
      ) as string,
      transform: [
        { scaleX: interpolate(s, [-1, 0, 0.7, 2], [0.72, 1, 1.08, 0.86], Extrapolation.CLAMP) },
        { scaleY: interpolate(s, [-1, 0, 0.7, 2], [0.72, 1, 1.06, 0.88], Extrapolation.CLAMP) * breathe },
        { translateX: interpolate(s, [0, 1.6, 2], [0, -2, -6], Extrapolation.CLAMP) + wobbleX },
      ],
      shadowColor: FLAME_GLOW,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: interpolate(s, WORD_GLOW_S_STOPS, [0, 0.55, 0.85, 0], Extrapolation.CLAMP),
      shadowRadius: interpolate(s, WORD_GLOW_S_STOPS, WORD_GLOW_RADIUS_STOPS, Extrapolation.CLAMP),
    };
  });

  // Each lick gets its own animated style — all derived from the audio clock
  const lickStyles = LICKS.map((lick) =>
    useAnimatedStyle(() => {
      const t = timeMs.value;
      const s = computeWordEnergy(t, word.startMs, word.endMs);
      const isActive = s > -0.3 && s < 1.6;

      // Buoyancy: each lick drifts upward at its own rate
      const buoyY = interpolate(s, [0, 1, 2], lick.buoyancy, Extrapolation.CLAMP);

      // Flicker: layered sine waves — no two licks move the same way
      const flickY = isActive
        ? Math.sin(t * lick.freqY + lick.phaseY) * lick.ampY
        + Math.cos(t * lick.freqY * 0.7 + lick.phaseY * 1.3) * lick.ampY * 0.35
        : 0;
      const flickX = isActive
        ? Math.cos(t * lick.freqX + lick.phaseX) * lick.ampX
        + Math.sin(t * lick.freqX * 1.4 + lick.phaseX * 0.6) * lick.ampX * 0.25
        : 0;
      const flickR = isActive
        ? Math.sin(t * lick.freqR + lick.phaseR) * lick.ampR
        : 0;

      // Each tip is a different brightness — fire tips don't burn equally
      const baseOpacity = interpolate(
        s, WORD_FLAME_S_STOPS, WORD_FLAME_OPACITY_STOPS, Extrapolation.CLAMP,
      );
      const brightness = isActive
        ? 0.7 + Math.sin(t * lick.freqY * 1.3 + lick.phaseY * 2.1) * 0.3
        : 1;

      return {
        opacity: baseOpacity * lick.opacityMul * brightness,
        backgroundColor: interpolateColor(
          s, WORD_FLAME_S_STOPS, WORD_FLAME_COLOR_STOPS, 'RGB',
        ) as string,
        transform: [
          { translateX: interpolate(s, [0, 1.6, 2], [0, -2, -6], Extrapolation.CLAMP) + flickX },
          { translateY: buoyY + flickY },
          { rotate: `${flickR}deg` },
          { scale: interpolate(s, [-1, 0, 0.7, 2], lick.sClamp, Extrapolation.CLAMP) },
        ],
      };
    }),
  );

  const textStyle = useAnimatedStyle(() => {
    const s = computeWordEnergy(timeMs.value, word.startMs, word.endMs);
    return {
      opacity: interpolate(s, [-1, 0, 1, 2], WORD_OPACITY_STOPS, Extrapolation.CLAMP),
      color: interpolateColor(s, WORD_COLOR_S_STOPS, WORD_COLOR_STOPS, 'RGB') as string,
      textShadowColor: interpolateColor(
        s, WORD_GLOW_S_STOPS, WORD_GLOW_COLOR_STOPS, 'RGB',
      ) as string,
      textShadowRadius: interpolate(
        s, WORD_GLOW_S_STOPS, WORD_GLOW_RADIUS_STOPS, Extrapolation.CLAMP,
      ),
      textShadowOffset: { width: 0, height: 0 },
      transform: [
        { scale: interpolate(s, [-0.6, 0.05, 0.7], [1, 1.02, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <View style={styles.wordWrapper}>
      {/* Flame licks — each tip burns and moves independently */}
      {LICKS.map((lick, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            styles.flameLick,
            {
              width: lick.width,
              left: lick.left,
              top: `${lick.topPct * 100}%` as unknown as number,
              bottom: `${lick.bottomPct * 100}%` as unknown as number,
              borderTopLeftRadius: lick.radii[0],
              borderBottomLeftRadius: lick.radii[1],
              borderTopRightRadius: lick.radii[2],
              borderBottomRightRadius: lick.radii[3],
            },
            lickStyles[i],
          ]}
        />
      ))}
      {/* Body capsule */}
      <Animated.View pointerEvents="none" style={[styles.flameBody, flameBodyStyle]} />
      <Animated.Text style={[styles.wordText, textStyle]}>{word.text}</Animated.Text>
      <Animated.Text style={[styles.wordSpace, textStyle]}> </Animated.Text>
    </View>
  );
};

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
    left: -5,
    right: -5,
    top: 6,
    bottom: 6,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 10,
    zIndex: 0,
  },
  flameLick: {
    position: 'absolute',
    zIndex: -1,
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
});
