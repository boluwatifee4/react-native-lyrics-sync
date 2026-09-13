import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface BackButtonProps {
  /** Accessible label read by screen readers, e.g. "Go back to Library". */
  accessibilityLabel?: string;
  /** Optional hint read after the label, e.g. "Double-tap to return". */
  accessibilityHint?: string;
  /** Override the default press behavior (e.g. for analytics or confirmation). */
  onPress?: () => void;
  /** Icon color; defaults to near-white to match the dark theme. */
  color?: string;
  /** Icon size in points; 22 keeps tap target large enough. */
  size?: number;
}

/**
 * Minimal, accessible back arrow.
 *
 * Usage (inside a Stack header):
 * ```tsx
 * <Stack.Screen
 *   name="details"
 *   options={{
 *     headerShown: true,
 *     headerTransparent: true,
 *     headerTitle: '',
 *     headerLeft: () => <BackButton accessibilityLabel="Back to library" />,
 *   }}
 * />
 * ```
 */
export function BackButton({
  accessibilityLabel = 'Go back',
  accessibilityHint,
  onPress,
  color = '#F4F4F5',
  size = 22,
}: BackButtonProps) {
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }

    router.back();
  };

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={handlePress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      hitSlop={8}
    >
      <View style={styles.iconWrapper}>
        <Ionicons
          name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
          size={size}
          color={color}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    // Ensure the tap target is comfortable while staying compact visually.
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  iconWrapper: {
    // Slight inset keeps the chevron visually aligned with header titles.
    paddingLeft: Platform.OS === 'ios' ? 1 : 0,
  },
});