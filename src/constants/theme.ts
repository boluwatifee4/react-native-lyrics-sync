/**
 * SpaceX / Starlink Inspired Design System Tokens
 * Mission Control for Audio Synchronization
 */

import '@/global.css';
import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#FFFFFF',
    backgroundElement: '#F4F4F5',
    backgroundSelected: '#E4E4E7',
    textSecondary: '#71717A',
  },
  dark: {
    // Legacy mapping compatibility
    text: '#F4F4F5',
    background: '#000000',
    backgroundElement: '#08080A',
    backgroundSelected: '#121216',
    textSecondary: '#A1A1AA',

    // Backgrounds — True Void & Layering
    void: '#000000',             // Deepest OLED base (blackout)
    surface: '#08080A',          // Elevated workspace surface
    surfaceSubtle: '#121216',    // Active / focused item highlight
    surfaceHighlight: '#1A1A22', // Hover / pressed state

    // Hairlines & Dividers (Extremely subtle)
    hairline: '#18181B',         // Subtle boundary
    hairlineSubtle: '#121214',   // Faint separator
    hairlineActive: '#27272A',   // Active / focused border
    border: '#18181B',
    borderSubtle: '#121214',

    // Typography Hierarchy
    textPrimary: '#F4F4F5',      // Near-white for active focal text
    textTertiary: '#52525B',     // Dark gray
    textMuted: '#52525B',        // Inactive readouts
    textGhost: '#27272A',        // Faintest technical text / placeholders

    // Functional State Accents (Used strictly for interaction & state)
    accent: '#3E9BFF',           // Electric Blue: Active, Live, Actionable
    accentMuted: '#3E9BFF25',    // Subtle active tint
    accentGlow: '#3E9BFF15',     // Soft ambient presence

    // Telemetry & Status Readouts
    success: '#30D158',          // Synced / Verified
    successMuted: '#30D15825',
    warning: '#FFD60A',          // In-progress / Notice
    warningMuted: '#FFD60A25',
    danger: '#FF453A',           // Clear / Error
    dangerMuted: '#FF453A25',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Typography = {
  fontFamily: Platform.select({
    ios: 'system-ui',
    default: 'normal',
  }),
  tabularNums: {
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  microLabel: {
    fontSize: 10,
    fontWeight: '600' as const,
    letterSpacing: 1.0,
    textTransform: 'uppercase' as const,
  },
  instrumentLabel: {
    fontSize: 11,
    fontWeight: '500' as const,
    letterSpacing: 0.6,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
} as const;

export const Spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,

  // Legacy scale aliases
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Geometry = {
  radiusNone: 0,
  radiusSharp: 2,
  radiusSm: 4,
  radiusPill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
