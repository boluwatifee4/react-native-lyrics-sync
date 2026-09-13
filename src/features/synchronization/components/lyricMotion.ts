import { Extrapolation, interpolate } from 'react-native-reanimated';

// --- PHASE WINDOWS (ms) ---
// Pre-activation "wake-up" window before a word's start time. Long enough to
// visibly "warm" the word before the voice reaches it.
export const PRE_ACTIVE_MS = 480;
// Residual decay window after a word's end time. This IS the trail: the sung
// word stays lit and slowly settles, creating temporal overlap into the next word.
export const RESIDUAL_MS = 1000;
// Line focus ramps before the first word starts, so the next line visibly wakes.
export const LINE_LEAD_MS = 900;
// Line focus decays after the last word ends, so sung lines visibly recede.
export const LINE_TRAIL_MS = 1500;

// The line focus floor: a fully "receded" line is still legible but clearly dim.
export const LINE_FOCUS_FLOOR = 0.5;

// --- COLOR STATES (translating the "energy field" through typography) ---
// Dormant future word.
export const COLOR_FUTURE = '#9CA3AF';
// Accent-tinted leading edge at ignition — warm flame front before clean white.
export const COLOR_IGNITION = '#FFB347';
// Fully illuminated active word.
export const COLOR_ACTIVE = '#FFFFFF';
// Settled residual word (brighter than future, softer than active).
export const COLOR_SETTLED = '#EAEAEF';

// Flame palette (the ░▒▓████ residual trail behind each word)
export const FLAME_TRANSPARENT = 'rgba(0,0,0,0)';
export const FLAME_IGNITION = '#FF7A00';
export const FLAME_PEAK = '#FFB347';
export const FLAME_CORE = '#FF6B00';
export const FLAME_GLOW = '#FF3B00';

// Opacity envelope stops for a word's energy scalar `s`:
//   s = -1 dormancy → 0 ignition → 1 illuminated → 2 residual (settling)
// The residual end stays bright so the trail reads clearly behind the playhead.
export const WORD_OPACITY_STOPS = [0.42, 1, 1, 0.92];

/**
 * Color stops for a word's energy scalar `s`. The warm accent band spans the
 * awakening phase and the leading fraction of the word itself — an ink-fill
 * front that fades to clean white as the audio completes the word.
 */
export const WORD_COLOR_S_STOPS = [-1, -0.45, 0.25, 1.35, 2];
export const WORD_COLOR_STOPS = [
  COLOR_FUTURE,
  COLOR_IGNITION,
  COLOR_ACTIVE,
  COLOR_ACTIVE,
  COLOR_SETTLED,
];

// Flame backing stops — drives the visible ░▒▓████ capsule behind the glyphs
export const WORD_FLAME_S_STOPS = [-1, -0.4, 0, 0.7, 1.6, 2];
export const WORD_FLAME_OPACITY_STOPS = [0, 0, 0.5, 0.75, 0.3, 0];
export const WORD_FLAME_COLOR_STOPS = [
  FLAME_TRANSPARENT,
  FLAME_TRANSPARENT,
  FLAME_IGNITION,
  FLAME_PEAK,
  FLAME_CORE,
  FLAME_TRANSPARENT,
];
export const WORD_GLOW_S_STOPS = [-1, -0.2, 0.6, 2];
export const WORD_GLOW_RADIUS_STOPS = [0, 8, 16, 0];
export const WORD_GLOW_COLOR_STOPS = [
  FLAME_TRANSPARENT,
  FLAME_IGNITION,
  FLAME_GLOW,
  FLAME_TRANSPARENT,
];

/**
 * Computes how "alive" a lyric line is at a given timestamp.
 * Returns LINE_FOCUS_FLOOR when the line is dormant/receded and 1 when the
 * audio is inside its window. Fully clock-driven so seeking is always correct.
 */
export function computeLineFocus(t: number, startMs: number, endMs: number): number {
  'worklet';
  if (t < startMs) {
    return interpolate(
      t,
      [startMs - LINE_LEAD_MS, startMs],
      [LINE_FOCUS_FLOOR, 1],
      Extrapolation.CLAMP,
    );
  }
  if (t <= endMs) {
    return 1;
  }
  return interpolate(
    t,
    [endMs, endMs + LINE_TRAIL_MS],
    [1, LINE_FOCUS_FLOOR],
    Extrapolation.CLAMP,
  );
}

/**
 * Computes a word's energy scalar from the audio clock.
 *   s = -1 far dormant (never touches the song yet)
 *   s → 0 awakening (pre-activation window before the word starts)
 *   s ∈ 0..1 illuminated (the word is being sung)
 *   s → 2 residual (settling into "sung" state with temporal overlap
 *         into the next word's awakening)
 */
export function computeWordEnergy(t: number, startMs: number, endMs: number): number {
  'worklet';
  const safeEnd = Math.max(endMs, startMs + 1);

  if (t < startMs) {
    return interpolate(t, [startMs - PRE_ACTIVE_MS, startMs], [-1, 0], Extrapolation.CLAMP);
  }
  if (t <= safeEnd) {
    return interpolate(t, [startMs, safeEnd], [0, 1], Extrapolation.CLAMP);
  }
  return interpolate(t, [safeEnd, safeEnd + RESIDUAL_MS], [1, 2], Extrapolation.CLAMP);
}