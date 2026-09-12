# Lyric Sync 🎵

A React Native app for creating and playing back **synchronized lyrics** — like karaoke, but you control the timing. Import any song, tap along to mark when each line starts, save your sync, and watch the lyrics scroll in real-time during playback.

Built with Expo SDK 57, TypeScript, and the React Native New Architecture.

---

## Features

### 🎧 Listener Player
- **Real-time lyric scrolling** that highlights the active line as audio plays
- **Tap any line to seek** directly to that moment in the song
- Transport controls: play/pause, skip ±5 seconds
- Progress bar with current/total time display

### ✏️ Sync Editor — "Tap-Along Recording"
- **One-tap sync workflow**: play the song, tap a big button each time the singer starts a new line
- **Three visual line states**: ✓ synced (green), ▶ active (cyan), · waiting (gray)
- **Instant feedback**: green flash overlay + haptic vibration on each mark
- **Undo**: reverts the last mark and rewinds audio 3 seconds for re-marking
- **Start Over**: clears all timestamps with confirmation (undoable)
- **Auto-finish**: last line's end time is set to the audio duration automatically
- **🎉 Celebration state**: visual "All Done!" when every line is synced
- **Progress indicator**: "Line 3 of 5 synced" with a fill bar

### 📂 Track Management
- **Import by URL**: paste an `.mp3` or `.m4a` link
- **Import from device**: pick audio files via the system file picker
- **Lyrics import**: paste plain text or pick a `.txt`/`.lrc` file (LRC timestamps are auto-parsed)
- **Track library**: browse, switch, and delete imported tracks
- **Persistent storage**: all tracks and sync data saved to SQLite

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Expo](https://expo.dev) SDK 57 + React Native 0.86 (New Architecture) |
| Language | TypeScript 6.0 |
| Routing | [Expo Router](https://docs.expo.dev/router/introduction/) (file-based) |
| State | [Zustand](https://zustand-demo.pmnd.rs/) |
| Audio | [expo-audio](https://docs.expo.dev/versions/latest/sdk/audio/) |
| Database | [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) |
| Haptics | [expo-haptics](https://docs.expo.dev/versions/latest/sdk/haptics/) |
| Validation | [Zod](https://zod.dev/) |
| Animations | React Native `Animated` API |
| Gestures | react-native-gesture-handler |

---

## Project Structure

```
src/
├── app/                          # Expo Router screens
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Tab navigator (Listener / Editor)
│   │   ├── index.tsx             # Listener Player screen
│   │   └── editor.tsx            # Sync Editor screen
│   └── _layout.tsx               # Root layout
│
├── domain/                       # Pure business logic (no React)
│   ├── lyrics.ts                 # Zod schemas, types, binary search algorithms
│   └── timelineEngine.ts         # One-tap mark, undo/redo, reset, LRC parser
│
├── features/
│   ├── creator/
│   │   └── components/
│   │       ├── SyncEditorView.tsx    # Main sync editor UI
│   │       └── ImportTrackModal.tsx  # Track import form
│   │
│   ├── player/
│   │   ├── store/
│   │   │   └── usePlayerStore.ts    # Zustand global state
│   │   └── components/
│   │       └── TrackLibraryModal.tsx # Browse/switch/delete tracks
│   │
│   └── synchronization/
│       ├── components/
│       │   ├── AudioWaveform.tsx           # Pseudo-amplitude waveform display
│       │   ├── SynchronizedLyricsView.tsx  # Real-time lyric scroller
│       │   └── LyricWordItem.tsx           # Word-level display component
│       └── hooks/
│           └── useAudioSync.ts            # Audio clock sync hook
│
└── services/
    └── db.ts                     # SQLite database (init, CRUD, seed data)
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- An Android device/emulator or iOS simulator
- [Expo Go](https://expo.dev/go) app (for quick testing) or an [Expo dev build](https://docs.expo.dev/develop/development-builds/introduction/)

### Install & Run

```bash
# Install dependencies
npm install

# Start the dev server
npx expo start
```

Scan the QR code with Expo Go, or press `a` for Android / `i` for iOS simulator.

### Default Track

The app ships with **"Lonely Spider"** by Children Rhymes Studio as a pre-loaded demo track with unsynced lyrics. Open the **Sync Editor** tab, play the audio, and tap along to mark each line.

Audio source: `https://etseverywhere.com/podpress_trac/web/259/0/lonely-spider-new.mp3`

---

## How to Sync a Song

1. Go to the **Sync Editor** tab
2. Tap **▶ Play** to start the audio
3. When you hear the singer begin a line, tap the big **"👇 TAP WHEN YOU HEAR THIS LINE"** button
4. The line turns green ✓ and the next line activates automatically
5. If you miss, tap **Undo** — the audio rewinds 3 seconds so you can re-tap
6. After all lines are marked, tap **Save** to persist your sync to the database
7. Switch to the **Listener Player** tab to see your lyrics scroll in real-time

---

## Architecture

### Single Authoritative Clock
The native `expo-audio` player status is the **single source of truth** for time. No duplicate clocks, no estimated positions. All timestamps come from `status.currentTime`.

### Timeline Engine (Pure Functions)
All sync logic lives in `src/domain/timelineEngine.ts` as **pure functions** with no React dependency:
- `markLineBoundary()` — One-tap: sets current line's startMs, closes previous line's endMs, advances cursor
- `markWordBoundary()` — Same concept for word-level sync
- `undoSyncAction()` / `redoSyncAction()` — Immutable history stack
- `resetAllTimestamps()` — "Start Over" (undoable)
- `finishLastLine()` — Auto-closes last line's endMs to audio duration
- `parseLyricsDocument()` — Handles plain text and LRC format

### State Management
- **Zustand** (`usePlayerStore`) for global state: active track, lyrics, playback position
- **React `useState`** for local editor state: history stack, active line index

### Database
SQLite via `expo-sqlite` with three tables:
- `tracks` — Song metadata (title, artist, audio URI, sync status)
- `lyric_lines` — Line text + timestamps (foreign key to tracks)
- `lyric_words` — Word text + timestamps (foreign key to lyric_lines)

---

## Future Roadmap

- [ ] **Fine Tune screen** — Word-level sync + nudge ±100ms per line/word
- [ ] **LRC export** — Export synced lyrics as `.lrc` files
- [ ] **Waveform seeking** — Tap the waveform to jump to a position
- [ ] **Real audio waveform** — Replace pseudo bars with actual amplitude data
- [ ] **Batch import** — Import multiple tracks at once

---

## License

MIT
