# Voice Dictation (Client-Side)

This document describes the **voice dictation feature** used by the Shattered Archive game client command input.

The current implementation intentionally favors **reliability and predictability** over continuous or streaming speech recognition.

---

## Goals

- Client-side only (no server audio upload)
- Deterministic UX
- Clear start / stop recording semantics
- No accidental overwrites of typed text
- Compatible with MUD-style command input

---

## User Experience

### Basic Flow

1. User clicks the **🎤 microphone button**
2. Browser begins recording speech
3. UI clearly indicates **Recording…**
4. User clicks the microphone again (or speech naturally ends)
5. Recognized text is **appended** to the input bar
6. User may edit or press **Enter** to send the command

### Important Behaviors

- Dictation **does not erase existing input**
- Text is appended with a single space
- No interim (partial) results are shown
- Recording must stop before text appears
- Pressing Enter while recording is disabled

---

## Why Single‑Utterance Mode?

Browser `SpeechRecognition` is unreliable when used continuously:

- Engines frequently stop on silence
- Interim results duplicate or overwrite text
- Restart loops cause UI desync
- Punctuation and “natural language” corrections interfere with MUD commands

To avoid these issues, the implementation uses:

- `continuous = false`
- `interimResults = false`
- One recognition session per click

This provides the most consistent cross‑browser behavior.

---

## Technical Overview

### Hook

`useVoiceDictation.ts`

- Wraps Web Speech API
- Tracks **engine state only**
- Forces abort if stop hangs
- Emits final transcript once per session

Key events used:

- `onstart` → UI switches to recording
- `onresult` → buffer transcript
- `onend` → commit transcript
- `onerror` → stop + surface error

---

### Command Input Integration

`CommandInput.tsx`

- Existing typed input is preserved
- Dictated text is appended
- Cursor moves to end after insertion
- Input regains focus automatically

---

## Known Limitations

- Accuracy depends on browser & OS
- Some slang may be normalized (e.g. “y” → “why”)
- Punctuation may be inserted by the engine
- Not suitable for long-form dictation

These are inherent to the Web Speech API.

---

## Future Enhancements (Optional)

- Slang normalization (strip punctuation, remap words)
- Cursor‑position insertion
- Alternate engines (Whisper WASM / WebGPU)
- Push‑to‑talk keyboard shortcut
- Dedicated “speech vs MUD” dictation modes

---

## Browser Support

| Browser | Status |
|------|------|
| Chrome | Supported |
| Edge | Supported |
| Safari | Partial |
| Firefox | ❌ No SpeechRecognition |

---

## Summary

This dictation system is designed to feel like:

> **“Hold radio → speak → release → send”**

rather than a live transcription editor.

---