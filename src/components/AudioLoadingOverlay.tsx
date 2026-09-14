import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

/**
 * Frosted, pulsing overlay shown while audio finishes loading (autoplay).
 * Purely visual — it never blocks touches underneath.
 */
export function AudioLoadingOverlay() {
  const glow = useSharedValue(0);
  const ring = useSharedValue(0);
  const dot = useSharedValue(0);

  useEffect(() => {
    glow.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
    ring.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }),
      -1,
      false
    );
    dot.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 450 }),
        withTiming(0, { duration: 450 })
      ),
      -1,
      false
    );
  }, [glow, ring, dot]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + glow.value * 0.65,
    transform: [{ scale: 1 + glow.value * 0.06 }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - ring.value),
    transform: [{ scale: 1 + ring.value * 1.8 }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dot.value,
  }));

  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.center}>
        <View style={styles.orbit}>
          <Animated.View style={[styles.pulseRing, ringStyle]} />
          <Animated.View style={[styles.iconBubble, glowStyle]}>
            <Ionicons name="musical-notes" size={26} color={Colors.dark.accent} />
          </Animated.View>
        </View>

        <View style={styles.labelRow}>
          <Animated.View style={[styles.loadingDot, dotStyle]} />
          <Text style={styles.label}>STARTING THE SONG</Text>
          <Animated.View style={[styles.loadingDot, dotStyle]} />
        </View>
        <Text style={styles.subLabel}>WAITING FOR AUDIO</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
  },
  orbit: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  pulseRing: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentGlow,
  },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.dark.surfaceHighlight,
    borderWidth: 1,
    borderColor: Colors.dark.accent + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.dark.accent,
  },
  label: {
    color: Colors.dark.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  subLabel: {
    color: Colors.dark.textTertiary,
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 2,
    marginTop: 6,
  },
});