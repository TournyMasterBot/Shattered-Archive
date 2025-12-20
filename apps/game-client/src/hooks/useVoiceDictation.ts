import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as Window;
  return (w.SpeechRecognition ?? (w as any).webkitSpeechRecognition ?? null) as SpeechRecognitionCtor | null;
}

interface UseVoiceDictationOptions {
  enabled?: boolean;

  /**
   * Called once when the engine ends and we have a final transcript.
   */
  onFinalText: (text: string) => void;

  onStart?: () => void;
  onEnd?: () => void;

  /**
   * When user clicks stop, if stop() doesn't end quickly, abort().
   */
  stopForceAbortMs?: number;
}

interface UseVoiceDictationResult {
  isSupported: boolean;
  isRecording: boolean; // engine state only
  lastError?: string;

  toggle: () => void;
  start: () => void;
  stop: () => void;
}

export function useVoiceDictation(options: UseVoiceDictationOptions): UseVoiceDictationResult {
  const { enabled = true, onFinalText, onStart, onEnd, stopForceAbortMs = 700 } = options;

  const Ctor = useMemo(() => getSpeechRecognitionCtor(), []);
  const isSupported = !!Ctor;

  const recRef = useRef<SpeechRecognition | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [lastError, setLastError] = useState<string | undefined>(undefined);

  // Accumulate final segments until onend
  const finalPartsRef = useRef<string[]>([]);

  // Used to force-abort if stop() doesn't end
  const stopTimerRef = useRef<number | null>(null);
  const clearStopTimer = () => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!isSupported) return;

    const rec = new Ctor!();

    // Single-utterance capture is most reliable for this UX
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = navigator.language || 'en-US';

    rec.onstart = () => {
      clearStopTimer();
      setLastError(undefined);
      setIsRecording(true);
      finalPartsRef.current = [];
      onStart?.();
    };

    rec.onend = () => {
      clearStopTimer();
      setIsRecording(false);
      onEnd?.();

      const combined = finalPartsRef.current.join(' ').replace(/\s+/g, ' ').trim();
      finalPartsRef.current = [];

      if (combined) onFinalText(combined);
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      clearStopTimer();
      setLastError(e.error || 'speech_error');
      setIsRecording(false);
      onEnd?.();
      finalPartsRef.current = [];
    };

    rec.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = (res[0]?.transcript ?? '').trim();
        if (!text) continue;

        // With interimResults=false, this should be final
        finalPartsRef.current.push(text);
      }
    };

    recRef.current = rec;

    return () => {
      clearStopTimer();
      try {
        rec.onstart = null;
        rec.onend = null;
        rec.onerror = null;
        rec.onresult = null;
        rec.stop();
      } catch {
        // ignore
      } finally {
        recRef.current = null;
      }
    };
  }, [Ctor, isSupported, onFinalText, onStart, onEnd]);

  const start = useCallback(() => {
    if (!enabled) return;
    const rec = recRef.current;
    if (!rec) return;

    try {
      setLastError(undefined);
      finalPartsRef.current = [];
      rec.start();
    } catch {
      // ignore
    }
  }, [enabled]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;

    clearStopTimer();

    try {
      rec.stop();
    } catch {
      // ignore
    }

    // Failsafe: if stop doesn't result in onend, abort it.
    stopTimerRef.current = window.setTimeout(() => {
      try {
        rec.abort();
      } catch {
        // ignore
      }
    }, stopForceAbortMs);
  }, [stopForceAbortMs]);

  const toggle = useCallback(() => {
    if (!enabled) return;
    if (isRecording) stop();
    else start();
  }, [enabled, isRecording, start, stop]);

  useEffect(() => {
    if (enabled) return;
    if (isRecording) stop();
  }, [enabled, isRecording, stop]);

  return { isSupported, isRecording, lastError, toggle, start, stop };
}
