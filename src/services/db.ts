import * as SQLite from 'expo-sqlite';
import { Track, LyricLine, LyricWord } from '../domain/lyrics';

const DB_NAME = 'lyric_sync.db';

let cachedDb: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  return await SQLite.openDatabaseAsync(DB_NAME, { useNewConnection: true });
}

function isBrickedConnection(e: unknown): boolean {
  return e instanceof Error && /NullPointerException|prepareAsync|execAsync/.test(e.message);
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (cachedDb) {
    return cachedDb;
  }
  if (!opening) {
    opening = openDatabase().then((db) => {
      cachedDb = db;
      return db;
    });
    opening.catch(() => {
      opening = null;
    });
  }
  return await opening;
}

async function withDatabase<T>(task: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const db = await getDatabase();
  try {
    return await task(db);
  } catch (e) {
    if (isBrickedConnection(e)) {
      cachedDb = null;
      opening = null;
      return await task(await getDatabase());
    }
    throw e;
  }
}

export async function initDatabase() {
  await withDatabase(async (db) => {
    await db.execAsync(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        audioUri TEXT NOT NULL,
        coverUri TEXT,
        durationMs INTEGER NOT NULL,
        syncStatus TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lyric_lines (
        id TEXT PRIMARY KEY NOT NULL,
        trackId TEXT NOT NULL,
        text TEXT NOT NULL,
        startMs INTEGER NOT NULL,
        endMs INTEGER NOT NULL,
        lineIndex INTEGER NOT NULL,
        FOREIGN KEY (trackId) REFERENCES tracks (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS lyric_words (
        id TEXT PRIMARY KEY NOT NULL,
        lineId TEXT NOT NULL,
        text TEXT NOT NULL,
        startMs INTEGER NOT NULL,
        endMs INTEGER NOT NULL,
        wordIndex INTEGER NOT NULL,
        FOREIGN KEY (lineId) REFERENCES lyric_lines (id) ON DELETE CASCADE
      );
    `);

    await seedDefaultTracks(db);
  });
}

async function seedDefaultTracks(db: SQLite.SQLiteDatabase) {
  const existingTrack = await db.getFirstAsync<{ id: string }>('SELECT id FROM tracks LIMIT 1');
  if (existingTrack) return;

  const now = Date.now();
  const trackId = 'sample-lonely-spider';

  await db.runAsync(
    `INSERT INTO tracks (id, title, artist, audioUri, coverUri, durationMs, syncStatus, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trackId,
      'Lonely Spider',
      'Children Rhymes Studio',
      'https://etseverywhere.com/podpress_trac/web/259/0/lonely-spider-new.mp3',
      'https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?w=400',
      75000,
      'draft',
      now,
      now,
    ]
  );

  const spiderLines = [
    'In a cave there lived a spider',
    'He liked to drink warm apple cider',
    'He liked to think about his life',
    "He wondered if he'd ever have a wife",
    'Lonely spider.',
  ];

  for (let idx = 0; idx < spiderLines.length; idx++) {
    const lineText = spiderLines[idx];
    const lineId = `spider-line-${idx + 1}`;
    await db.runAsync(
      `INSERT INTO lyric_lines (id, trackId, text, startMs, endMs, lineIndex)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [lineId, trackId, lineText, 0, 0, idx]
    );

    const words = lineText.split(/\s+/).filter((w) => w.length > 0);
    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      await db.runAsync(
        `INSERT INTO lyric_words (id, lineId, text, startMs, endMs, wordIndex)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`spider-word-${lineId}-${wIdx}`, lineId, words[wIdx], 0, 0, wIdx]
      );
    }
  }
}

export async function fetchAllTracks(): Promise<Track[]> {
  return await withDatabase(async (db) => {
    return await db.getAllAsync<Track>('SELECT * FROM tracks ORDER BY createdAt DESC');
  });
}

export async function fetchTrackWithLyrics(trackId: string): Promise<{ track: Track; lines: LyricLine[] } | null> {
  return await withDatabase(async (db) => {
    const track = await db.getFirstAsync<Track>('SELECT * FROM tracks WHERE id = ?', [trackId]);
    if (!track) return null;

    const rawLines = await db.getAllAsync<{ id: string; trackId: string; text: string; startMs: number; endMs: number; lineIndex: number }>(
      'SELECT * FROM lyric_lines WHERE trackId = ? ORDER BY lineIndex ASC',
      [trackId]
    );

    const lines: LyricLine[] = [];

    for (const line of rawLines) {
      const rawWords = await db.getAllAsync<LyricWord>(
        'SELECT id, lineId, text, startMs, endMs FROM lyric_words WHERE lineId = ? ORDER BY wordIndex ASC',
        [line.id]
      );

      lines.push({
        id: line.id,
        trackId: line.trackId,
        text: line.text,
        startMs: line.startMs,
        endMs: line.endMs,
        words: rawWords,
      });
    }

    return { track, lines };
  });
}

export async function createTrack(track: Track, lines: LyricLine[]): Promise<void> {
  await withDatabase(async (db) => {
    await db.runAsync(
      `INSERT INTO tracks (id, title, artist, audioUri, coverUri, durationMs, syncStatus, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        track.id,
        track.title,
        track.artist,
        track.audioUri,
        track.coverUri || '',
        track.durationMs || 0,
        track.syncStatus || 'draft',
        track.createdAt || Date.now(),
        track.updatedAt || Date.now(),
      ]
    );

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      await db.runAsync(
        `INSERT INTO lyric_lines (id, trackId, text, startMs, endMs, lineIndex)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [line.id, track.id, line.text || '', line.startMs || 0, line.endMs || 0, idx]
      );

      if (line.words && line.words.length > 0) {
        for (let wIdx = 0; wIdx < line.words.length; wIdx++) {
          const w = line.words[wIdx];
          await db.runAsync(
            `INSERT INTO lyric_words (id, lineId, text, startMs, endMs, wordIndex)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [w.id, line.id, w.text || '', w.startMs || 0, w.endMs || 0, wIdx]
          );
        }
      }
    }
  });
}

export async function saveTrackLyrics(trackId: string, lines: LyricLine[]): Promise<void> {
  await withDatabase(async (db) => {
    await db.runAsync('DELETE FROM lyric_lines WHERE trackId = ?', [trackId]);

    for (let lIdx = 0; lIdx < lines.length; lIdx++) {
      const line = lines[lIdx];
      const lineId = line.id || `line-${Date.now()}-${lIdx}`;

      await db.runAsync(
        `INSERT INTO lyric_lines (id, trackId, text, startMs, endMs, lineIndex)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [lineId, trackId, line.text || '', line.startMs || 0, line.endMs || 0, lIdx]
      );

      if (line.words && line.words.length > 0) {
        for (let wIdx = 0; wIdx < line.words.length; wIdx++) {
          const w = line.words[wIdx];
          const wordId = w.id || `word-${lineId}-${wIdx}`;

          await db.runAsync(
            `INSERT INTO lyric_words (id, lineId, text, startMs, endMs, wordIndex)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [wordId, lineId, w.text || '', w.startMs || 0, w.endMs || 0, wIdx]
          );
        }
      }
    }

    await db.runAsync('UPDATE tracks SET syncStatus = ?, updatedAt = ? WHERE id = ?', [
      'word_synced',
      Date.now(),
      trackId,
    ]);
  });
}

export async function deleteTrack(trackId: string): Promise<void> {
  await withDatabase(async (db) => {
    await db.runAsync('DELETE FROM tracks WHERE id = ?', [trackId]);
  });
}
