// apps/game-client/src/hooks/useEquipmentCapture.ts
import { useEffect, useRef } from 'react';
import { buildEqSnapshot, isEqHeader } from '../features/equipment/eq-parse';
import { getEquipmentProfile, setEquipmentFromEq, setEqSnapshot } from '../features/equipment/equipment-store';
import { extractTerminalText } from '../features/terminal/extractTerminalText';
import { stripItemStatusPrefixes } from '../features/equipment/equipment-text';

const EQ_CAPTURE_VERSION = 'eq-capture.v3.prompt-or-timeout';
const EQ_IDLE_END_MS = 250; // if no new eq lines arrive for this long, end capture

function stripAnsi(input: string): string {
  return String(input ?? '').replace(/\u001b\[[0-9;]*m/g, '');
}

function splitIntoLines(chunk: string): string[] {
  if (!chunk) return [];
  return chunk.split(/\r?\n/);
}

function isPromptLine(line: string): boolean {
  const normalized = stripAnsi(line).replace(/\r/g, '').trim();
  return normalized.includes('tnl>');
}

function hasEqTagLine(line: string): boolean {
  const normalized = stripAnsi(line).replace(/\r/g, '');
  return normalized.trim().startsWith('<');
}

export function useEquipmentCapture(connectionId: string) {
  const capturing = useRef(false);
  const buffer = useRef<string[]>([]);
  const seenAnyEq = useRef(false);

  const idleTimer = useRef<number | null>(null);

  function clearIdleTimer() {
    if (idleTimer.current != null) {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }

  function endCapture(reason: 'prompt' | 'idle') {
    if (!capturing.current) return;

    capturing.current = false;
    clearIdleTimer();

    console.debug(`[eq-capture] END (${reason}) (${EQ_CAPTURE_VERSION})`, {
      count: buffer.current.length,
    });

    const snapshot = buildEqSnapshot(buffer.current);

    // Guard: do not overwrite a previous non-empty snapshot with an empty one
    const prevProfile = getEquipmentProfile(connectionId);
    const prevLinesCount = prevProfile.snapshot?.allLines?.length ?? 0;

    if ((snapshot.allLines?.length ?? 0) === 0 && prevLinesCount > 0) {
      console.warn('[eq-capture] ignoring empty eq snapshot; keeping previous snapshot', {
        connectionId,
        prevLinesCount,
      });
      buffer.current = [];
      return;
    }

    void setEqSnapshot(connectionId, snapshot);

    void setEquipmentFromEq(connectionId, {
      wielded: stripItemStatusPrefixes(snapshot.slots.wielded?.rawLine ?? '(nothing)'),
      secondary: stripItemStatusPrefixes(snapshot.slots.secondary_weapon?.rawLine ?? '(nothing)'),
      shield: stripItemStatusPrefixes(snapshot.slots.worn_as_shield?.rawLine ?? '(nothing)'),
      sheathed: stripItemStatusPrefixes(snapshot.slots.sheathed?.rawLine ?? '(nothing)'),
    });

    buffer.current = [];
  }

  function armIdleEnd() {
    clearIdleTimer();
    idleTimer.current = window.setTimeout(() => endCapture('idle'), EQ_IDLE_END_MS);
  }

  useEffect(() => {
    const onTerminal = (ev: Event) => {
      const detail = (ev as CustomEvent<unknown>).detail;
      const chunk = extractTerminalText(detail);
      if (!chunk) return;

      const lines = splitIntoLines(chunk);

      for (const rawLine of lines) {
        const line = rawLine;

        const normalized = stripAnsi(line).replace(/\r/g, '');

        // Start capturing on header
        if (isEqHeader(line)) {
          capturing.current = true;
          buffer.current = [];
          seenAnyEq.current = true;
          console.debug(`[eq-capture] START (${EQ_CAPTURE_VERSION})`);
          armIdleEnd();
          continue;
        }

        if (!capturing.current) continue;

        // Prompt ends capture immediately
        if (isPromptLine(line)) {
          endCapture('prompt');
          continue;
        }

        // Buffer anything that looks relevant:
        // - <slot> lines
        // - blanks (harmless; buildEqSnapshot ignores)
        // - lines in between (if any)
        buffer.current.push(line);

        // Reset idle end when we see likely eq content
        if (hasEqTagLine(line) || normalized.trim() === '') {
          armIdleEnd();
        }
      }
    };

    // TMB TODO : window.addEventListener('game:terminal-data', onTerminal as EventListener);
    return () => {
      /*console.debug(`[eq-capture] hook unmounted (${EQ_CAPTURE_VERSION})`, {
        connectionId,
        seenAnyEq: seenAnyEq.current,
      });*/
      clearIdleTimer();
      // TMB TODO : window.removeEventListener('game:terminal-data', onTerminal as EventListener);
    };
  }, [connectionId]);
}
