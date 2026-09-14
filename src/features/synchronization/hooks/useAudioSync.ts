import { useEffect, useRef } from 'react';
import { useSharedValue, cancelAnimation, withTiming, Easing } from 'react-native-reanimated';
import { usePlayerStore } from '../../player/store/usePlayerStore';

export function useAudioSync() {
  const timeMs = useSharedValue(0);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const positionMs = usePlayerStore((s) => s.positionMs);
  const durationMs = usePlayerStore((s) => s.durationMs);

  const prevPlayingRef = useRef(false);

  useEffect(() => {
    const isPlaybackStateChanged = prevPlayingRef.current !== isPlaying;
    prevPlayingRef.current = isPlaying;

    const diff = Math.abs(timeMs.value - positionMs);
    // If user seeked or state changed, sync position
    if (isPlaybackStateChanged || diff > 400) {
      timeMs.value = positionMs;
    }

    if (isPlaying && durationMs > positionMs) {
      const remainingMs = Math.max(0, durationMs - positionMs);
      timeMs.value = withTiming(durationMs, {
        duration: remainingMs,
        easing: Easing.linear,
      });
    } else {
      cancelAnimation(timeMs);
      timeMs.value = positionMs;
    }
  }, [isPlaying, positionMs, durationMs, timeMs]);

  return { timeMs };
}
