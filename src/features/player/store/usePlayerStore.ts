import { create } from 'zustand';
import { Track, LyricLine } from '../../../domain/lyrics';

interface PlayerStore {
  activeTrack: Track | null;
  lyrics: LyricLine[];
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;

  // Actions
  setActiveTrack: (track: Track, lyrics: LyricLine[]) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPositionMs: (positionMs: number) => void;
  setDurationMs: (durationMs: number) => void;
  updateLyricLineTimestamp: (lineIndex: number, startMs: number, endMs: number) => void;
  updateLyricWordTimestamp: (lineIndex: number, wordIndex: number, startMs: number, endMs: number) => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  activeTrack: null,
  lyrics: [],
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,

  setActiveTrack: (track, lyrics) => set({ activeTrack: track, lyrics }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPositionMs: (positionMs) => set({ positionMs }),
  setDurationMs: (durationMs) => set({ durationMs }),

  updateLyricLineTimestamp: (lineIndex, startMs, endMs) =>
    set((state) => {
      const updated = [...state.lyrics];
      if (updated[lineIndex]) {
        updated[lineIndex] = { ...updated[lineIndex], startMs, endMs };
      }
      return { lyrics: updated };
    }),

  updateLyricWordTimestamp: (lineIndex, wordIndex, startMs, endMs) =>
    set((state) => {
      const updated = [...state.lyrics];
      if (updated[lineIndex] && updated[lineIndex].words[wordIndex]) {
        const words = [...updated[lineIndex].words];
        words[wordIndex] = { ...words[wordIndex], startMs, endMs };
        updated[lineIndex] = { ...updated[lineIndex], words };
      }
      return { lyrics: updated };
    }),
}));
