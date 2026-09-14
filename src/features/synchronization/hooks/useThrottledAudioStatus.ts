import { useEffect, useRef, useState } from 'react';
import { AudioPlayer, AudioStatus } from 'expo-audio';

/**
 * Audio status is pushed natively at very high frequency (up to every frame).
 * `useAudioPlayerStatus` calls setState on each tick, which re-renders the whole
 * screen every frame and saturates the JS thread, making taps feel laggy.
 *
 * This hook subscribes to `playbackStatusUpdate` directly and only re-renders
 * when a value meaningfully changed (~10Hz quantized), or on play/pause/load
 * transitions. The audio itself is not affected — only React re-renders are.
 */
export function useThrottledAudioStatus(player: AudioPlayer, intervalMs = 100): AudioStatus {
  const [visible, setVisible] = useState<AudioStatus>(() => player.currentStatus);
  const lastEmitRef = useRef({ at: 0, pos: -1, dur: -1, playing: false, loaded: false });

  useEffect(() => {
    const emitIfChanged = (next: AudioStatus) => {
      const last = lastEmitRef.current;
      const curMs = Math.floor((next.currentTime || 0) * 1000);
      const durMs = Math.floor((next.duration || 0) * 1000);
      const now = Date.now();

      const posChanged = Math.floor(curMs / intervalMs) !== Math.floor(last.pos / intervalMs);
      const otherChanged =
        last.dur !== durMs ||
        last.playing !== next.playing ||
        last.loaded !== next.isLoaded;

      if (now - last.at >= intervalMs || posChanged || otherChanged) {
        last.at = now;
        last.pos = curMs;
        last.dur = durMs;
        last.playing = next.playing;
        last.loaded = next.isLoaded;
        setVisible(next);
      }
    };

    player.addListener('playbackStatusUpdate', emitIfChanged);
    return () => player.removeListener('playbackStatusUpdate', emitIfChanged);
  }, [player, intervalMs]);

  return visible;
}