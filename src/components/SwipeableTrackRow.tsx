import React from 'react';
import { View, Text, StyleSheet, Image, Alert } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  runOnJS,
  Extrapolation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Track } from '../domain/lyrics';
import { Colors, Typography } from '../constants/theme';

const SWIPE_THRESHOLD = 80;

interface SwipeableTrackRowProps {
  track: Track;
  onSelect: (track: Track) => void;
  onDelete: (trackId: string) => void;
  onResetSync: (trackId: string) => void;
}

export function SwipeableTrackRow({
  track,
  onSelect,
  onDelete,
  onResetSync,
}: SwipeableTrackRowProps) {
  const tx = useSharedValue(0);
  const scale = useSharedValue(1);
  const lastTx = useSharedValue(0);
  const thresholdCrossed = useSharedValue(false);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const syncStatus = (status: string) => {
    switch (status) {
      case 'word_synced':
        return { label: 'WORD SYNC', color: Colors.dark.success };
      case 'line_synced':
        return { label: 'LINE SYNC', color: Colors.dark.warning };
      default:
        return { label: 'DRAFT', color: Colors.dark.textMuted };
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete Track',
      `Remove "${track.title}" from your library?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(track.id),
        },
      ]
    );
  };

  const confirmReset = () => {
    Alert.alert(
      'Un-sync Track',
      `Reset all timestamps for "${track.title}"? The lyrics will need to be synced again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Un-sync',
          onPress: () => onResetSync(track.id),
        },
      ]
    );
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onStart(() => {
      lastTx.value = tx.value;
      thresholdCrossed.value = false;
    })
    .onUpdate((e) => {
      const next = lastTx.value + e.translationX;
      // Rubber-band past thresholds
      const dampened =
        Math.abs(next) > SWIPE_THRESHOLD
          ? Math.sign(next) * (SWIPE_THRESHOLD + (Math.abs(next) - SWIPE_THRESHOLD) * 0.25)
          : next;
      tx.value = dampened;

      // Subtle press scale
      scale.value = interpolate(Math.abs(tx.value), [0, SWIPE_THRESHOLD], [1, 0.97], {
        extrapolateRight: Extrapolation.CLAMP,
      });

      // Haptic tick when crossing threshold
      const isPast = Math.abs(dampened) >= SWIPE_THRESHOLD;
      if (isPast && !thresholdCrossed.value) {
        thresholdCrossed.value = true;
        runOnJS(triggerHaptic)();
      } else if (!isPast && thresholdCrossed.value) {
        thresholdCrossed.value = false;
      }
    })
    .onEnd((e) => {
      const isRight = tx.value >= SWIPE_THRESHOLD || (e.velocityX > 700 && tx.value > 25);
      const isLeft = tx.value <= -SWIPE_THRESHOLD || (e.velocityX < -700 && tx.value < -25);

      // Instantly snap card back with snappy spring
      tx.value = withSpring(0, { damping: 22, stiffness: 300 });
      scale.value = withSpring(1, { damping: 16, stiffness: 240 });
      thresholdCrossed.value = false;

      // Instantly open native alert without artificial delays
      if (isRight) {
        runOnJS(confirmReset)();
      } else if (isLeft) {
        runOnJS(confirmDelete)();
      }
    });

  // Simple tap opens the track in the player
  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(onSelect)(track);
  });

  const composed = Gesture.Race(pan, tap);

  // ── Card transform ──
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { scale: scale.value },
      {
        skewY: `${interpolate(tx.value, [-200, 0, 200], [-1.5, 0, 1.5], {
          extrapolateLeft: Extrapolation.CLAMP,
          extrapolateRight: Extrapolation.CLAMP,
        })}deg`,
      },
    ],
  }));

  // ── Reset panel (amber/warning, on the left, revealed by swiping right tx > 0) ──
  const resetPanelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [0, SWIPE_THRESHOLD * 0.3, SWIPE_THRESHOLD], [0, 0.8, 1], {
      extrapolateLeft: Extrapolation.CLAMP,
      extrapolateRight: Extrapolation.CLAMP,
    }),
    transform: [
      {
        scale: interpolate(tx.value, [0, SWIPE_THRESHOLD], [0.7, 1], {
          extrapolateLeft: Extrapolation.CLAMP,
          extrapolateRight: Extrapolation.CLAMP,
        }),
      },
    ],
  }));

  // ── Delete panel (red/danger, on the right, revealed by swiping left tx < 0) ──
  const deletePanelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-SWIPE_THRESHOLD, -SWIPE_THRESHOLD * 0.3, 0], [1, 0.8, 0], {
      extrapolateLeft: Extrapolation.CLAMP,
      extrapolateRight: Extrapolation.CLAMP,
    }),
    transform: [
      {
        scale: interpolate(tx.value, [-SWIPE_THRESHOLD, 0], [1, 0.7], {
          extrapolateLeft: Extrapolation.CLAMP,
          extrapolateRight: Extrapolation.CLAMP,
        }),
      },
    ],
  }));

  // ── Pure UI Thread Hint Animations ──
  const resetHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      tx.value,
      [SWIPE_THRESHOLD * 0.45, SWIPE_THRESHOLD * 0.8],
      [0, 1],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        scale: interpolate(
          tx.value,
          [SWIPE_THRESHOLD * 0.45, SWIPE_THRESHOLD * 0.8],
          [0.85, 1],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const deleteHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      tx.value,
      [-SWIPE_THRESHOLD * 0.8, -SWIPE_THRESHOLD * 0.45],
      [1, 0],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        scale: interpolate(
          tx.value,
          [-SWIPE_THRESHOLD * 0.8, -SWIPE_THRESHOLD * 0.45],
          [1, 0.85],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const badge = syncStatus(track.syncStatus);

  return (
    <View style={styles.rowWrapper}>
      {/* ── Action panels (behind card) ── */}
      <View style={styles.panelsContainer}>
        {/* Left Side (revealed when swiping right): UN-SYNC */}
        <View style={styles.resetPanel}>
          <Animated.View style={[styles.iconWrap, styles.resetIconWrap, resetPanelStyle]}>
            <Ionicons name="refresh-outline" size={18} color="#000000" />
          </Animated.View>
          <Animated.View style={resetPanelStyle}>
            <Text style={styles.resetLabel}>UN-SYNC</Text>
          </Animated.View>
        </View>

        {/* Right Side (revealed when swiping left): DELETE */}
        <View style={styles.deletePanel}>
          <Animated.View style={[styles.iconWrap, styles.deleteIconWrap, deletePanelStyle]}>
            <Ionicons name="trash" size={18} color="#FFFFFF" />
          </Animated.View>
          <Animated.View style={deletePanelStyle}>
            <Text style={styles.deleteLabel}>DELETE</Text>
          </Animated.View>
        </View>
      </View>

      {/* ── Card ── */}
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.trackCard, cardStyle]}>
          <Animated.View style={styles.coverWrap}>
            <Image
              source={{ uri: track.coverUri || 'https://picsum.photos/200/200' }}
              style={styles.trackCover}
            />
          </Animated.View>

          <View style={styles.trackInfo}>
            <Text style={styles.trackTitle} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={styles.trackArtist} numberOfLines={1}>
              {track.artist}
            </Text>
            <View style={styles.trackFooter}>
              <View style={[styles.statusDot, { backgroundColor: badge.color }]} />
              <Text style={[styles.statusLabel, { color: badge.color }]}>{badge.label}</Text>
            </View>
          </View>

          <View style={styles.trackAction}>
            <Ionicons name="play" size={14} color={Colors.dark.accent} />
          </View>
        </Animated.View>
      </GestureDetector>

      {/* ── Floating hint badges (100% UI thread animation) ── */}
      <Animated.View style={[styles.floatingHint, styles.resetHint, resetHintStyle]} pointerEvents="none">
        <Ionicons name="refresh" size={10} color="#000" />
        <Text style={[styles.hintText, { color: '#000' }]}>RELEASE TO UN-SYNC</Text>
      </Animated.View>

      <Animated.View style={[styles.floatingHint, styles.deleteHint, deleteHintStyle]} pointerEvents="none">
        <Ionicons name="trash" size={10} color="#FFF" />
        <Text style={styles.hintText}>RELEASE TO DELETE</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowWrapper: {
    marginBottom: 6,
    position: 'relative',
  },

  // ── Panels behind card ──
  panelsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
  },
  resetPanel: {
    flex: 1,
    backgroundColor: Colors.dark.warning,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: 20,
    gap: 8,
  },
  deletePanel: {
    flex: 1,
    backgroundColor: Colors.dark.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 20,
    gap: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIconWrap: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  resetIconWrap: {
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  deleteLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  resetLabel: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // ── Card ──
  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
  },
  coverWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 14,
  },
  trackCover: {
    width: 52,
    height: 52,
    backgroundColor: Colors.dark.hairline,
  },
  trackInfo: {
    flex: 1,
    gap: 3,
  },
  trackTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  trackArtist: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    fontWeight: '400',
  },
  trackFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusLabel: {
    ...Typography.microLabel,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  trackAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.accentGlow,
    borderWidth: 1,
    borderColor: Colors.dark.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },

  // ── Floating hints ──
  floatingHint: {
    position: 'absolute',
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 10,
  },
  deleteHint: {
    right: 16,
    backgroundColor: Colors.dark.danger,
  },
  resetHint: {
    left: 16,
    backgroundColor: Colors.dark.warning,
  },
  hintText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});