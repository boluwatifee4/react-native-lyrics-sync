# [Implementation Plan] Standalone React Native Expo Synchronized Lyrics App (`lyric-sync`)

Initial setup and scaffolding of a production-grade React Native Expo app (`lyric-sync`) housed directly in `/Users/mac/Documents/project/mobile/lyric-sync`.

The application handles low-latency **Audio-Time Synchronization**, high-performance 60 FPS **Animated Lyric Rendering**, and a **Tap-to-Stamp Lyric Authoring Editor**.

---

## Architecture Overview

```
                          ┌─────────────────────────┐
                          │   Expo Router (app/)    │
                          └────────────┬────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
     [ Player Route ]                                [ Creator Route ]
  (Spotify-style UI)                                (Sync Editor Tooling)
                │                                             │
                └──────────────────────┬──────────────────────┘
                                       │
                                       ▼
                     ┌──────────────────────────────────┐
                     │   Feature Layer (src/features)   │
                     │  • player  • synchronization     │
                     │  • creator • storage             │
                     └─────────────────┬────────────────┘
                                       │
                                       ▼
                     ┌──────────────────────────────────┐
                     │   Domain Layer (src/domain)      │
                     │   Pure JS Sync Calculations      │
                     │   O(log N) Active Line/Word      │
                     └─────────────────┬────────────────┘
                                       │
                  ┌────────────────────┴────────────────────┐
                  ▼                                         ▼
    [ Native Audio Engine ]                      [ Local SQLite DB ]
    (expo-audio / SharedValue)                   (expo-sqlite / Zod)
```

---

## Proposed Scaffolding Steps

### 1. Project Initialization
- Scaffold a clean TypeScript Expo project named `lyric-sync` in `/Users/mac/Documents/project/mobile/lyric-sync`.
- Configure `app.json` for New Architecture.

### 2. Dependency Installation
- **Navigation**: `expo-router`
- **Audio & System**: `expo-audio`, `expo-sqlite`, `expo-document-picker`, `expo-file-system`
- **Performance & Animations**: `react-native-reanimated`, `react-native-gesture-handler`
- **State & Validation**: `zustand`, `zod`

### 3. Core Directory Structure (`src/`)
#### [NEW] `src/domain/lyrics.ts` - Pure domain types, Zod schemas, & binary search lookup
#### [NEW] `src/services/db.ts` - SQLite schema setup (`tracks`, `lyric_lines`, `lyric_words`)
#### [NEW] `src/features/synchronization/hooks/useAudioSync.ts` - Clock driver updating Reanimated `SharedValue<number>`
#### [NEW] `src/features/synchronization/components/SynchronizedLyricsView.tsx` - 60 FPS Lyric List
#### [NEW] `src/features/synchronization/components/LyricWordItem.tsx` - Reanimated UI Worklet Word Highlighting
#### [NEW] `src/features/creator/components/SyncEditorView.tsx` - Interactive Tap-to-Stamp Timestamping Editor
#### [NEW] `src/features/player/store/usePlayerStore.ts` - Zustand track & playback state

---

## Verification Plan

### Automated Verification
- Run TypeScript type-checking: `npx tsc --noEmit` inside `lyric-sync` directory.
- Verify Expo project configuration: `npx expo config`.

### Manual Verification
- Launch local Expo server (`npx expo start`) and verify route navigation, audio loading, and lyric synchronization playback.
