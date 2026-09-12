import { z } from 'zod';

// --- PLAYBACK & SYNC STATUS TYPES ---

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended';

export interface PlaybackSnapshot {
  state: PlaybackState;
  positionMs: number;
  durationMs: number;
  bufferedMs?: number;
}

export type SyncStatus = 'draft' | 'line_synced' | 'word_synced' | 'published';

// --- ZOD SCHEMAS & DOMAIN TYPES ---

export const LyricWordSchema = z.object({
  id: z.string(),
  lineId: z.string(),
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
});

export const LyricLineSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  words: z.array(LyricWordSchema),
});

export const TrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  audioUri: z.string(),
  coverUri: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
  syncStatus: z.enum(['draft', 'line_synced', 'word_synced', 'published']),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type LyricWord = z.infer<typeof LyricWordSchema>;
export type LyricLine = z.infer<typeof LyricLineSchema>;
export type Track = z.infer<typeof TrackSchema>;

export interface ActiveSyncState {
  activeLineIndex: number;
  activeWordIndex: number;
  lineProgress: number; // 0.0 -> 1.0
  wordProgress: number; // 0.0 -> 1.0
}

// --- DOMAIN ALGORITHMS ---

/**
 * Binary search to find the active line index for a given timestamp in milliseconds.
 * Time complexity: O(log N)
 */
export function findActiveLineIndex(lines: LyricLine[], timeMs: number): number {
  if (!lines || lines.length === 0) return -1;

  let low = 0;
  let high = lines.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const line = lines[mid];

    if (timeMs >= line.startMs && timeMs <= line.endMs && line.startMs < line.endMs) {
      return mid;
    } else if (timeMs < line.startMs) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // Fallback for gaps between lines
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startMs > 0 && timeMs >= lines[i].endMs && timeMs < lines[i + 1].startMs) {
      return i;
    }
  }

  if (timeMs >= lines[lines.length - 1].startMs && lines[lines.length - 1].startMs > 0) {
    return lines.length - 1;
  }

  return lines.length > 0 && timeMs >= lines[0].startMs && lines[0].startMs > 0 ? 0 : -1;
}

/**
 * Binary search to find the active word index within a line.
 */
export function findActiveWordIndex(words: LyricWord[], timeMs: number): number {
  if (!words || words.length === 0) return -1;

  let low = 0;
  let high = words.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const word = words[mid];

    if (timeMs >= word.startMs && timeMs <= word.endMs) {
      return mid;
    } else if (timeMs < word.startMs) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  for (let i = 0; i < words.length - 1; i++) {
    if (timeMs >= words[i].endMs && timeMs < words[i + 1].startMs) {
      return i;
    }
  }

  return words.length > 0 && timeMs >= words[0].startMs ? 0 : -1;
}

/**
 * Calculates normalized progress (0.0 to 1.0) between startMs and endMs.
 */
export function calculateProgress(startMs: number, endMs: number, currentMs: number): number {
  if (endMs <= startMs) return 1.0;
  if (currentMs <= startMs) return 0.0;
  if (currentMs >= endMs) return 1.0;
  return (currentMs - startMs) / (endMs - startMs);
}
