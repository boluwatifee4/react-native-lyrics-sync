# Sync Editor UX Redesign — "Karaoke Recording" Flow

## Problem

The current editor asks users to:
1. Select a line → Mark Start → Mark End → Select next line → repeat

This is confusing because:
- There's **no visual confirmation** that a mark was captured
- The user doesn't know **what to do next** after marking
- There's **no undo at all** — if you mess up, you're stuck (the Undo/Redo buttons exist in code but are invisible / buried in a header row nobody notices)
- The UI has too many buttons (`Start -100ms`, `End +100ms`, Phase toggles) cluttering the screen
- A "college dropout" user can't figure it out

## New Design: "Tap-Along Recording"

The mental model becomes: **"Play the song. Tap when you hear each line start. Done."**

```
┌──────────────────────────────────────────────┐
│  🎵 Lonely Spider        [Library] [+ Import]│
│  Children Rhymes Studio                      │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  ▸▸▸▸▸▸▸▸▸▸▸▸●──────────── 00:04.28   │  │
│  │         AUDIO WAVEFORM                 │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌── READY TO MARK ──────────────────────┐   │
│  │                                       │   │
│  │   ✓ In a cave there lived a spider    │ ← green = done
│  │   ✓ He liked to drink warm apple...   │ ← green = done
│  │  ▶ He liked to think about his life   │ ← PULSING = next to mark
│  │   · He wondered if he'd ever have...  │ ← dim = waiting
│  │   · Lonely spider.                    │ ← dim = waiting
│  │                                       │   │
│  └───────────────────────────────────────┘   │
│                                              │
├──────────────────────────────────────────────┤
│                                              │
│   ◀◀  [ ▶ PLAY ]  ▶▶       [ ↩ UNDO ]       │
│                                              │
│  ╔════════════════════════════════════════╗   │
│  ║                                       ║   │
│  ║           ⬇  TAP TO MARK  ⬇          ║   │ ← BIG, pulsing, unmissable
│  ║     "He liked to think about..."      ║   │
│  ║                                       ║   │
│  ╚════════════════════════════════════════╝   │
│                                              │
│  [ 🔄 Start Over ]            [ 💾 Save ]    │
│                                              │
└──────────────────────────────────────────────┘
```

---

## Key UX Principles

### 1. One Giant Button, One Action — "Tap when the singer starts this line"
The **TAP TO MARK** button is the only thing the user needs to think about. It shows the **next line text** so they know exactly what they're marking. One tap = mark current line's start time and previous line's end time.

> **When do I tap?** You tap the **instant** you hear the singer begin singing the line shown on the button. Not at the end — at the **very start**.

Here's a concrete walkthrough with the Lonely Spider song:

```
Audio playing...  🔊 "In a cave there lived a—"
                     ↑
             You hear the singer start.
             You TAP the button.
             → Line 1 gets startMs = 00:02.400

Audio continues... 🔊 "He liked to drink warm—"
                     ↑
             Singer starts line 2.
             You TAP again.
             → Line 1 gets endMs = 00:06.100 (auto-closed)
             → Line 2 gets startMs = 00:06.100

... and so on until the last line.
```

The button itself says **exactly** what to do:

```
╔══════════════════════════════════════╗
║   👇 TAP WHEN YOU HEAR THIS LINE   ║
║                                     ║
║  "He liked to think about his life" ║
╚══════════════════════════════════════╝
```

No ambiguity. No "start" vs "end" confusion. Just tap when you hear it.

> [!TIP]
> **"What if I miss it by a second or two?"** — That's totally fine. You have three safety nets:
>
> 1. **Close enough is good enough.** Being within ~200ms is basically imperceptible in karaoke. Nobody will notice if you're a beat late. This is relaxed — not a twitch-reflex test.
> 2. **Undo + re-tap.** If you *know* you were way off, tap **Undo**, the audio rewinds a few seconds, and you tap **MARK** again at the right moment. Takes 3 seconds to fix.
> 3. **Fine-tune later.** After you've marked all lines, a **Fine Tune** screen lets you nudge any line's timing by ±100ms increments until it feels perfect. So the first pass is just about getting "roughly right."

### 2. Instant Visual Feedback
When the user taps MARK:
- The line **flashes green** briefly (200ms glow animation)
- The line moves from "pulsing/next" state to "✓ done" state
- The **next line pulses** to draw attention
- A subtle **haptic vibration** confirms the action (via `expo-haptics`)

### 3. Three Line States (No Ambiguity)
| State | Visual | Meaning |
|-------|--------|---------|
| ✓ **Synced** | Green text, checkmark | Timestamp captured |
| ▶ **Active** | White text, pulsing glow border | "Tap MARK when you hear this line" |
| · **Waiting** | Dim gray text | Not yet reached |

### 4. Undo = "Oops, I tapped too late"
Single **Undo** button rewinds to the previous line. The user sees the line go from green back to pulsing. Dead simple.

### 5. Start Over = Nuclear Reset
One button to clear all timestamps and restart from line 1. Asks for confirmation first.

### 6. Auto-Finish
When the last line is marked, the UI automatically sets its `endMs` to the audio duration and shows a "🎉 All Done! Save your sync." celebration state.

---

## Proposed Changes

### Domain Layer

#### [MODIFY] [`timelineEngine.ts`](file:///Users/mac/Documents/project/mobile/lyric-sync/src/domain/timelineEngine.ts)
- Add `resetAllTimestamps(history)` → clears all startMs/endMs to 0, pushes to history
- Add `finishLastLine(history, lineIndex, durationMs)` → sets endMs of last line to audio duration

---

### Feature Layer

#### [MODIFY] [`SyncEditorView.tsx`](file:///Users/mac/Documents/project/mobile/lyric-sync/src/features/creator/components/SyncEditorView.tsx)
Complete rewrite of the UI:

**Remove:**
- Phase 1/Phase 2 toggle (word sync moved to a future "fine-tune" mode)
- 4× nudge buttons from the main flow
- Separate Mark Start / Mark End concept

**Add:**
- **Giant "TAP TO MARK" button** at the bottom, showing the next line text
- **Three-state line list** (synced ✓ / active ▶ / waiting ·)
- **Flash-green animation** on mark using `Animated` from React Native
- **Haptic feedback** on mark via `expo-haptics` (`Haptics.impactAsync(ImpactFeedbackStyle.Medium)`)
- **"Start Over"** button with confirmation alert
- **"All Done 🎉"** celebration state when all lines are marked
- **Compact transport controls** (play/pause + skip ±5s + undo)
- Progress indicator: "Line 3 of 5 synced"

#### [MODIFY] [`AudioWaveform.tsx`](file:///Users/mac/Documents/project/mobile/lyric-sync/src/features/synchronization/components/AudioWaveform.tsx)
- Make the waveform area tappable for seeking (so user can rewind to re-mark)
- Shrink label from "AUDIO WAVEFORM" to just the timestamp

---

### Dependencies

#### `expo-haptics`
- Install: `npx expo install expo-haptics`
- Used for tactile confirmation on each mark tap

---

## What Gets Moved (NOT Removed)

> [!IMPORTANT]
> Word-level sync is **not being deleted**. All domain code (`markWordBoundary`, `nudgeWordTimestamp` in `timelineEngine.ts`) stays exactly as-is. We're just giving it **its own screen** instead of cramming it into the same view as line sync.

| Feature | Where it goes | Why |
|---------|--------------|-----|
| Word-level sync (Phase 2) | Separate **"Fine Tune"** screen, unlocked after all lines are synced | Keeps the main flow dead simple — one concern per screen |
| Nudge ±100ms buttons | Also on the **"Fine Tune"** screen | Power-user feature that clutters the beginner flow |
| LRC export | Future feature | Not yet needed |

---

## Verification Plan

### Automated Tests
- `npx tsc --noEmit` for zero TypeScript errors

### Manual Verification
1. Import a track with lyrics → verify it shows in the editor
2. Play audio → tap MARK along with each line → verify green flash + haptic
3. Tap Undo → verify previous line goes back to "active" state
4. Tap "Start Over" → verify all lines reset to unsynced
5. Mark all lines → verify "🎉 All Done" state appears
6. Save → verify data persists in SQLite
