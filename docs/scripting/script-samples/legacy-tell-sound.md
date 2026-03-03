# Event Type
`shatteredarchive:raw-data`

# Language
`Typescript`

# Match Text
`tells you`

# Script Body
```typescript
/**
 * Self-contained script that *executes immediately* in a browser.
 * - Plays the bell once on load (will work only if the browser allows autoplay)
 * - Also installs a click/keydown fallback (recommended; most browsers require a user gesture)
 *
 * Paste this into a TS user-script runner (or compile to JS) and it will run.
 */

type PlayBellNote = { frequency: number; duration: number };

interface PlayBellOptions {
  volume?: number; // 0..1
  fadeOutSeconds?: number;
  notes?: PlayBellNote[];
  reuseAudioContext?: boolean;
}

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(reuse: boolean): AudioContext {
  const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as
    | (new () => AudioContext)
    | undefined;

  if (!Ctor) throw new Error("Web Audio API is not available in this environment.");

  if (!reuse) return new Ctor();

  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new Ctor();
  }
  return sharedAudioContext;
}

async function playBell(
  message: string,
  options: PlayBellOptions = {}
): Promise<void> {
  void message;

  const {
    volume = 0.5,
    fadeOutSeconds = 1.5,
    reuseAudioContext = true,
    notes = [
      { frequency: 880, duration: 0.15 },
      { frequency: 988, duration: 0.15 },
      { frequency: 1046, duration: 0.2 },
    ],
  } = options;

  const context = getAudioContext(reuseAudioContext);

  // Common requirement: must be resumed on a user gesture.
  if (context.state === "suspended") {
    await context.resume();
  }

  const now = context.currentTime;
  const gainNode = context.createGain();

  const v = Math.max(0, Math.min(1, volume));
  gainNode.gain.setValueAtTime(v, now);
  gainNode.gain.exponentialRampToValueAtTime(
    0.0001,
    now + Math.max(0.01, fadeOutSeconds)
  );

  gainNode.connect(context.destination);

  let t = now;
  for (const note of notes) {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(note.frequency, t);
    osc.connect(gainNode);
    osc.start(t);
    t += Math.max(0.001, note.duration);
    osc.stop(t);
  }

  // Cleanup after playback ends
  const doneAt = t + 0.05;
  await new Promise<void>((resolve) => {
    window.setTimeout(() => {
      try {
        gainNode.disconnect();
      } catch {
        /* noop */
      }
      resolve();
    }, Math.max(0, (doneAt - context.currentTime) * 1000));
  });
}

/** Executes bell playback in the most reliable way: from a user gesture. */
function installGestureFallback() {
  const handler = async () => {
    window.removeEventListener("click", handler, true);
    window.removeEventListener("keydown", handler, true);
    try {
      await playBell("gesture");
    } catch (e) {
      console.error("PlayBell failed:", e);
    }
  };

  // Capture phase so it fires early and reliably.
  window.addEventListener("click", handler, true);
  window.addEventListener("keydown", handler, true);
}

/** Immediate execution */
(async () => {
  try {
    // Attempt to play immediately (may be blocked by autoplay policies).
    await playBell("auto");
  } catch (e) {
    // If blocked, set up user-gesture fallback so it *will* execute on next click/keydown.
    console.warn("Autoplay likely blocked; click or press any key to play the bell once.", e);
    installGestureFallback();
  }
})();
```