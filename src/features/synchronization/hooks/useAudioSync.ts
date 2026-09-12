import { useEffect } from 'react';
import { useSharedValue, cancelAnimation, withTiming, Easing } from 'react-native-reanimated';
import { usePlayerStore } from '../../player/store/usePlayerStore';

export function useAudioSync() {
  const timeMs = useSharedValue(0);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const positionMs = usePlayerStore((s) => s.positionMs);
  const durationMs = usePlayerStore((s) => s.durationMs);

  useEffect(() => {
    timeMs.value = positionMs;

    if (isPlaying && durationMs > positionMs) {
      const remainingMs = durationMs - positionMs;
      timeMs.value = withTiming(durationMs, {
        duration: remainingMs,
        easing: Easing.linear,
      });
    } else {
      cancelAnimation(timeMs);
    }
  }, [isPlaying, positionMs, durationMs, timeMs]);

  return { timeMs };
}
