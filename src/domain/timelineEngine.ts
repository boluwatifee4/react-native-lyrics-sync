import { LyricLine, LyricWord } from './lyrics';

export interface SyncHistoryState {
  past: LyricLine[][];
  present: LyricLine[];
  future: LyricLine[][];
}

export function createInitialHistory(initialLines: LyricLine[]): SyncHistoryState {
  return {
    past: [],
    present: initialLines || [],
    future: [],
  };
}

const MAX_HISTORY_DEPTH = 50;

/**
 * One-Tap Line Capture Workflow:
 * - Sets startMs of current active line.
 * - Sets endMs of previous line to current timeMs (only if previous line was synced).
 * - Advances focus index to activeIndex + 1.
 */
export function markLineBoundary(
  history: SyncHistoryState,
  activeIndex: number,
  timeMs: number
): { history: SyncHistoryState; nextIndex: number } {
  const currentLines = history.present;
  if (activeIndex < 0 || activeIndex >= currentLines.length) {
    return { history, nextIndex: activeIndex };
  }

  const updatedLines = [...currentLines];
  const targetLine = currentLines[activeIndex];

  // Set startMs of active line
  updatedLines[activeIndex] = {
    ...targetLine,
    startMs: timeMs,
    words: targetLine.words.map((w) => ({ ...w })),
  };

  // Close previous line's endMs ONLY IF previous line is synced (has startMs > 0)
  if (activeIndex > 0) {
    const prevLine = currentLines[activeIndex - 1];
    if (prevLine.startMs > 0) {
      updatedLines[activeIndex - 1] = {
        ...prevLine,
        endMs: timeMs,
      };
    }
  }

  const newPast =
    history.past.length >= MAX_HISTORY_DEPTH
      ? history.past.slice(history.past.length - (MAX_HISTORY_DEPTH - 1))
      : history.past;

  const nextHistory: SyncHistoryState = {
    past: [...newPast, history.present],
    present: updatedLines,
    future: [], // Clear redo history on new action
  };

  const nextIndex = Math.min(updatedLines.length - 1, activeIndex + 1);

  return { history: nextHistory, nextIndex };
}

/**
 * One-Tap Word Capture Workflow:
 * - Sets startMs of current word inside the specified line.
 * - Closes endMs of previous word in that line.
 * - If starting word 0, closes previous line only if it was synced.
 * - Advances to wordIndex + 1.
 */
export function markWordBoundary(
  history: SyncHistoryState,
  lineIndex: number,
  wordIndex: number,
  timeMs: number
): { history: SyncHistoryState; nextWordIndex: number } {
  const currentLines = history.present;
  if (
    lineIndex < 0 ||
    lineIndex >= currentLines.length ||
    wordIndex < 0 ||
    wordIndex >= currentLines[lineIndex].words.length
  ) {
    return { history, nextWordIndex: wordIndex };
  }

  const targetLine = currentLines[lineIndex];
  const newWords = [...targetLine.words];

  // Close previous word in this same line
  if (wordIndex > 0) {
    newWords[wordIndex - 1] = {
      ...newWords[wordIndex - 1],
      endMs: timeMs,
    };
  }

  // Set active word timestamp
  newWords[wordIndex] = {
    ...newWords[wordIndex],
    startMs: timeMs,
  };

  // First word sets line startMs if not already set
  const lineStartMs = wordIndex === 0 && targetLine.startMs === 0 ? timeMs : targetLine.startMs;

  const updatedLines = [...currentLines];
  updatedLines[lineIndex] = {
    ...targetLine,
    startMs: lineStartMs,
    words: newWords,
  };

  // Starting a new line's first word closes the previous line (if previous line is synced)
  if (wordIndex === 0 && lineIndex > 0) {
    const prevLine = currentLines[lineIndex - 1];
    if (prevLine.startMs > 0) {
      const prevWords = [...prevLine.words];
      if (prevWords.length > 0 && prevWords[prevWords.length - 1].startMs > 0) {
        prevWords[prevWords.length - 1] = {
          ...prevWords[prevWords.length - 1],
          endMs: timeMs,
        };
      }
      updatedLines[lineIndex - 1] = {
        ...prevLine,
        endMs: timeMs,
        words: prevWords,
      };
    }
  }

  const newPast =
    history.past.length >= MAX_HISTORY_DEPTH
      ? history.past.slice(history.past.length - (MAX_HISTORY_DEPTH - 1))
      : history.past;

  const nextHistory: SyncHistoryState = {
    past: [...newPast, history.present],
    present: updatedLines,
    future: [],
  };

  const nextWordIndex = Math.min(targetLine.words.length - 1, wordIndex + 1);

  return { history: nextHistory, nextWordIndex };
}

/**
 * Closes out the final word of the final line (and the line itself) to the
 * audio duration. Called automatically when the last word is captured.
 */
export function finishLastWord(
  history: SyncHistoryState,
  lineIndex: number,
  wordIndex: number,
  timeMs: number
): SyncHistoryState {
  const currentLines = history.present;
  if (
    lineIndex < 0 ||
    lineIndex >= currentLines.length ||
    wordIndex < 0 ||
    wordIndex >= currentLines[lineIndex].words.length
  ) {
    return history;
  }

  const targetLine = currentLines[lineIndex];
  const newWords = [...targetLine.words];
  if (newWords[wordIndex]) {
    newWords[wordIndex] = {
      ...newWords[wordIndex],
      endMs: timeMs,
    };
  }

  const updatedLines = [...currentLines];
  updatedLines[lineIndex] = {
    ...targetLine,
    endMs: timeMs,
    words: newWords,
  };

  const newPast =
    history.past.length >= MAX_HISTORY_DEPTH
      ? history.past.slice(history.past.length - (MAX_HISTORY_DEPTH - 1))
      : history.past;

  return {
    past: [...newPast, history.present],
    present: updatedLines,
    future: [],
  };
}

/**
 * Shifts every timestamp of a line (start, end, and all words) by deltaMs.
 * Used for the per-line delay/offset fine-tune control.
 */
export function shiftLineTimestamp(
  history: SyncHistoryState,
  lineIndex: number,
  deltaMs: number
): SyncHistoryState {
  const currentLines = history.present;
  if (lineIndex < 0 || lineIndex >= currentLines.length) return history;

  const updatedLines = currentLines.map((line, lIdx) => {
    if (lIdx !== lineIndex) return line;
    const words = line.words.map((w) => ({
      ...w,
      startMs: Math.max(0, w.startMs + deltaMs),
      endMs: Math.max(0, w.endMs + deltaMs),
    }));
    return {
      ...line,
      startMs: Math.max(0, line.startMs + deltaMs),
      endMs: Math.max(0, line.endMs + deltaMs),
    };
  });

  return {
    past: [...history.past, history.present],
    present: updatedLines,
    future: [],
  };
}

/**
 * Shifts a single word's start + end timestamps by deltaMs (Fine Tune).
 */
export function shiftWordTimestamp(
  history: SyncHistoryState,
  lineIndex: number,
  wordIndex: number,
  deltaMs: number
): SyncHistoryState {
  const currentLines = history.present;
  if (
    lineIndex < 0 ||
    lineIndex >= currentLines.length ||
    wordIndex < 0 ||
    wordIndex >= currentLines[lineIndex].words.length
  ) {
    return history;
  }

  const updatedLines = currentLines.map((line, lIdx) => {
    if (lIdx !== lineIndex) return line;
    const words = line.words.map((w, wIdx) =>
      wIdx === wordIndex
        ? {
            ...w,
            startMs: Math.max(0, w.startMs + deltaMs),
            endMs: Math.max(0, w.endMs + deltaMs),
          }
        : w
    );
    return { ...line, words };
  });

  return {
    past: [...history.past, history.present],
    present: updatedLines,
    future: [],
  };
}

/**
 * Nudges a line timestamp by deltaMs (+/- 100ms).
 */
export function nudgeLineTimestamp(
  history: SyncHistoryState,
  lineIndex: number,
  field: 'startMs' | 'endMs',
  deltaMs: number
): SyncHistoryState {
  const currentLines = history.present;
  if (lineIndex < 0 || lineIndex >= currentLines.length) return history;

  const updatedLines = currentLines.map((line, idx) => {
    if (idx !== lineIndex) return line;
    const val = Math.max(0, line[field] + deltaMs);
    return { ...line, [field]: val };
  });

  return {
    past: [...history.past, history.present],
    present: updatedLines,
    future: [],
  };
}

/**
 * Nudges an individual word timestamp (+/- 50ms).
 */
export function nudgeWordTimestamp(
  history: SyncHistoryState,
  lineIndex: number,
  wordIndex: number,
  field: 'startMs' | 'endMs',
  deltaMs: number
): SyncHistoryState {
  const currentLines = history.present;
  if (
    lineIndex < 0 ||
    lineIndex >= currentLines.length ||
    wordIndex < 0 ||
    wordIndex >= currentLines[lineIndex].words.length
  ) {
    return history;
  }

  const updatedLines = currentLines.map((line, lIdx) => {
    if (lIdx !== lineIndex) return line;
    const words = line.words.map((w, wIdx) => {
      if (wIdx !== wordIndex) return w;
      return { ...w, [field]: Math.max(0, w[field] + deltaMs) };
    });
    return { ...line, words };
  });

  return {
    past: [...history.past, history.present],
    present: updatedLines,
    future: [],
  };
}

/**
 * Undo last action.
 */
export function undoSyncAction(history: SyncHistoryState): SyncHistoryState {
  if (history.past.length === 0) return history;

  const previous = history.past[history.past.length - 1];
  const newPast = history.past.slice(0, history.past.length - 1);

  return {
    past: newPast,
    present: previous,
    future: [history.present, ...history.future],
  };
}

/**
 * Redo last undone action.
 */
export function redoSyncAction(history: SyncHistoryState): SyncHistoryState {
  if (history.future.length === 0) return history;

  const next = history.future[0];
  const newFuture = history.future.slice(1);

  return {
    past: [...history.past, history.present],
    present: next,
    future: newFuture,
  };
}

/**
 * Parses LRC format content (`[mm:ss.xx] Line text`) or plain text into raw lines with timestamps.
 */
export function parseLyricsDocument(content: string): Array<{ text: string; startMs: number; endMs: number }> {
  if (!content || typeof content !== 'string') return [];
  const lrcRegex = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\](.*)/;
  const rawLines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const parsed: Array<{ text: string; startMs: number; endMs: number }> = [];

  for (const line of rawLines) {
    const match = line.match(lrcRegex);
    if (match) {
      const minutes = parseInt(match[1], 10) || 0;
      const seconds = parseInt(match[2], 10) || 0;
      let sub = 0;
      if (match[3]) {
        const rawSub = parseInt(match[3], 10) || 0;
        sub = match[3].length === 2 ? rawSub * 10 : match[3].length === 1 ? rawSub * 100 : rawSub;
      }
      const startMs = minutes * 60000 + seconds * 1000 + sub;
      const text = (match[4] || '').trim();

      if (text.length > 0) {
        parsed.push({ text, startMs: isNaN(startMs) ? 0 : Math.max(0, startMs), endMs: 0 });
      }
    } else {
      // Plain text line
      parsed.push({ text: line, startMs: 0, endMs: 0 });
    }
  }

  // Calculate approximate endMs for consecutive LRC lines
  for (let i = 0; i < parsed.length - 1; i++) {
    if (parsed[i].startMs > 0 && parsed[i + 1].startMs > parsed[i].startMs) {
      parsed[i].endMs = parsed[i + 1].startMs;
    } else {
      parsed[i].endMs = parsed[i].startMs;
    }
  }

  if (parsed.length > 0 && parsed[parsed.length - 1].endMs === 0) {
    parsed[parsed.length - 1].endMs = parsed[parsed.length - 1].startMs;
  }

  return parsed;
}

function formatLrcTimestamp(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const cents = Math.floor((Math.max(0, ms) % 1000) / 10);
  return `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cents).padStart(2, '0')}]`;
}

/**
 * Builds standard LRC text from synced lines (`[mm:ss.xx] Line text`).
 * Lines without a start timestamp are skipped.
 */
export function buildLrcText(lines: LyricLine[]): string {
  if (!lines || lines.length === 0) return '';

  const blocks: string[] = ['[ti:Lyric Sync]'];
  for (const line of lines) {
    if (line.startMs <= 0) continue;
    if (line.words && line.words.length > 0 && line.words.length < 12) {
      // Enhanced LRC with word-level timestamps
      const wordTag = line.words
        .map((w) => `<${formatLrcTimestamp(w.startMs)}>${w.text}`)
        .join('');
      blocks.push(`${formatLrcTimestamp(line.startMs)}${wordTag}`);
    } else {
      blocks.push(`${formatLrcTimestamp(line.startMs)}${line.text}`);
    }
  }

  return blocks.join('\n') + '\n';
}

/**
 * Resets all line and word timestamps to 0 (for "Start Over").
 * Pushes the current state onto history so it can be undone.
 */
export function resetAllTimestamps(history: SyncHistoryState): SyncHistoryState {
  const clearedLines = history.present.map((line) => ({
    ...line,
    startMs: 0,
    endMs: 0,
    words: line.words.map((w) => ({
      ...w,
      startMs: 0,
      endMs: 0,
    })),
  }));

  const newPast =
    history.past.length >= MAX_HISTORY_DEPTH
      ? history.past.slice(history.past.length - (MAX_HISTORY_DEPTH - 1))
      : history.past;

  return {
    past: [...newPast, history.present],
    present: clearedLines,
    future: [],
  };
}

/**
 * Sets the endMs of the last marked line to the audio duration.
 * Called automatically when the user marks the final line.
 */
export function finishLastLine(
  history: SyncHistoryState,
  lineIndex: number,
  durationMs: number
): SyncHistoryState {
  const currentLines = history.present;
  if (lineIndex < 0 || lineIndex >= currentLines.length) return history;

  const updatedLines = [...currentLines];
  updatedLines[lineIndex] = {
    ...currentLines[lineIndex],
    endMs: durationMs,
  };

  const newPast =
    history.past.length >= MAX_HISTORY_DEPTH
      ? history.past.slice(history.past.length - (MAX_HISTORY_DEPTH - 1))
      : history.past;

  return {
    past: [...newPast, history.present],
    present: updatedLines,
    future: [],
  };
}
