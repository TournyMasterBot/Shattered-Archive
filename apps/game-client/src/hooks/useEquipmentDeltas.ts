// apps\game-client\src\hooks\useEquipmentDeltas.ts
import { useEffect } from 'react';
import { parseEqDeltaLine } from '../features/equipment/eq-delta-parse';
import { extractTerminalText } from '../features/terminal/extractTerminalText';
import {
  getEquipmentProfile,
  getEquipmentState,
  patchEqSnapshot,
  setEquipmentFromDelta,
} from '../features/equipment/equipment-store';
import type { EqSlot } from '../features/equipment/equipment-types';
import { stripItemStatusPrefixes } from '../features/equipment/equipment-text';

function splitToLines(text: string): string[] {
  return String(text ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((x) => x ?? '');
}

function stripAnsi(input: string): string {
  return String(input ?? '').replace(/\u001b\[[0-9;]*m/g, '');
}

function normalizeForCompare(input: string): string {
  const base = stripItemStatusPrefixes(input);
  const s = stripAnsi(base).toLowerCase().trim();

  const noPunct = s.replace(/[.,;:!?'"`]/g, ' ');
  const noArticles = noPunct.replace(/\b(the|an|a)\b/g, ' ');
  const compact = noArticles.replace(/\s+/g, ' ').trim();

  const withoutSuffix = compact
    .replace(/\babout your waist\b/g, '')
    .replace(/\babout your torso\b/g, '')
    .replace(/\bon your torso\b/g, '')
    .replace(/\bon your head\b/g, '')
    .replace(/\bon your legs\b/g, '')
    .replace(/\bon your feet\b/g, '')
    .replace(/\bon your hands\b/g, '')
    .replace(/\baround your neck\b/g, '')
    .replace(/\baround your left wrist\b/g, '')
    .replace(/\baround your right wrist\b/g, '')
    .replace(/\bon your left finger\b/g, '')
    .replace(/\bon your right finger\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return withoutSuffix;
}

function bestSnapshotSlotMatch(connectionId: string, removedItem: string): EqSlot | null {
  const prof = getEquipmentProfile(connectionId);
  const snap = prof.snapshot;
  if (!snap?.slots) return null;

  const target = normalizeForCompare(removedItem);
  if (!target) return null;

  let best: { slot: EqSlot; score: number } | null = null;
  let tie = false;

  for (const [slot, entry] of Object.entries(snap.slots) as Array<[EqSlot, any]>) {
    const rawLine = String(entry?.rawLine ?? '');
    const candidate = normalizeForCompare(rawLine);
    if (!candidate) continue;

    // simple scoring: exact normalized match wins; otherwise substring match
    let score = 0;
    if (candidate === target) score = 100;
    else if (candidate.includes(target) || target.includes(candidate)) score = 50;

    if (score <= 0) continue;

    if (!best || score > best.score) {
      best = { slot, score };
      tie = false;
    } else if (best && score === best.score) {
      tie = true;
    }
  }

  // conservative: only return if unique best
  if (!best || tie) return null;
  return best.slot;
}

export function useEquipmentDeltas(connectionId: string) {
  useEffect(() => {
    const onTerminal = (ev: Event) => {
      const detail = (ev as CustomEvent<unknown>).detail;
      const chunk = extractTerminalText(detail);
      if (!chunk) return;

      const lines = splitToLines(chunk);

      for (const line of lines) {
        const evt = parseEqDeltaLine(line);
        if (!evt) continue;

        // Always read current hotbar for removal rules.
        const st = getEquipmentState(connectionId);

        const wielded = st.slots.wielded?.text ?? '';
        const secondary = st.slots.secondary?.text ?? '';
        const shield = st.slots.shield?.text ?? '';
        const sheathed = st.slots.sheathed?.text ?? '';

        if (evt.kind === 'disarm') {
          try {
            window.dispatchEvent(new CustomEvent('event:disarm', { detail: wielded }));
          } catch {
            // ignore
          }
          // hotbar
          void setEquipmentFromDelta(connectionId, { wielded: '(nothing)', secondary: '(nothing)' });
          // snapshot (delete so we don't show stale)
          void patchEqSnapshot(connectionId, { wielded: null, secondary_weapon: null });
          continue;
        }

        if (evt.kind === 'wield') {
          if (evt.isSecondary) {
            try {
              window.dispatchEvent(new CustomEvent('event:wield:secondary', { detail: evt.item }));
            } catch {
              // ignore
            }
            void setEquipmentFromDelta(connectionId, { secondary: evt.item });
            void patchEqSnapshot(connectionId, { secondary_weapon: evt.item });
          } else {
            try {
              window.dispatchEvent(new CustomEvent('event:wield:primary', { detail: evt.item }));
            } catch {
              // ignore
            }
            void setEquipmentFromDelta(connectionId, { wielded: evt.item });
            void patchEqSnapshot(connectionId, { wielded: evt.item });
          }
          continue;
        }

        if (evt.kind === 'wear') {
          try {
            console.log('Emitting event', {
              eventName: 'event:gear:wear',
              detail: evt.item,
            });
            window.dispatchEvent(new CustomEvent(`event:gear:wear`, { detail: evt.item }));
            window.dispatchEvent(new CustomEvent(`event:gear:wear:${evt.slot}`, { detail: evt.item }));
          } catch {
            // ignore
          }
          // snapshot always gets the slot (this is what fixes your modal issue)
          void patchEqSnapshot(connectionId, { [evt.slot]: evt.item } as Partial<Record<EqSlot, string | null>>);

          // hotbar only mirrors a subset
          if (evt.slot === 'worn_as_shield') {
            void setEquipmentFromDelta(connectionId, { shield: evt.item });
          }
          if (evt.slot === 'sheathed') {
            void setEquipmentFromDelta(connectionId, { sheathed: evt.item });
          }
          if (evt.slot === 'wielded') {
            void setEquipmentFromDelta(connectionId, { wielded: evt.item });
          }
          if (evt.slot === 'secondary_weapon') {
            void setEquipmentFromDelta(connectionId, { secondary: evt.item });
          }
          continue;
        }

        if (evt.kind === 'stop_using') {
          const removedRaw = evt.item;
          const removed = normalizeForCompare(removedRaw);

          const wNorm = normalizeForCompare(wielded);
          const sNorm = normalizeForCompare(secondary);
          const shNorm = normalizeForCompare(shield);
          const sheNorm = normalizeForCompare(sheathed);

          const matchesWielded = removed && wNorm && removed === wNorm;
          const matchesSecondary = removed && sNorm && removed === sNorm;
          const matchesShield = removed && shNorm && removed === shNorm;
          const matchesSheathed = removed && sheNorm && removed === sheNorm;

          try {
            window.dispatchEvent(new CustomEvent(`event:gear:remove`, { detail: evt.item }));
          } catch {
            // ignore
          }

          // Hotbar rules first
          if (matchesWielded) {
            // Dual-wield removal rule: removing primary clears both
            if (secondary && secondary !== '(nothing)') {
              void setEquipmentFromDelta(connectionId, { wielded: '(nothing)', secondary: '(nothing)' });
              void patchEqSnapshot(connectionId, { wielded: null, secondary_weapon: null });
            } else {
              void setEquipmentFromDelta(connectionId, { wielded: '(nothing)' });
              void patchEqSnapshot(connectionId, { wielded: null });
            }
            continue;
          }

          if (matchesSecondary) {
            void setEquipmentFromDelta(connectionId, { secondary: '(nothing)' });
            void patchEqSnapshot(connectionId, { secondary_weapon: null });
            continue;
          }

          if (matchesShield) {
            void setEquipmentFromDelta(connectionId, { shield: '(nothing)' });
            void patchEqSnapshot(connectionId, { worn_as_shield: null });
            continue;
          }

          if (matchesSheathed) {
            void setEquipmentFromDelta(connectionId, { sheathed: '(nothing)' });
            void patchEqSnapshot(connectionId, { sheathed: null });
            continue;
          }

          // Snapshot-only removal: try to find the correct slot (conservative)
          const slot = bestSnapshotSlotMatch(connectionId, removedRaw);
          if (slot) {
            try {
              window.dispatchEvent(new CustomEvent(`event:gear:remove:${slot}`, { detail: evt.item }));
            } catch {
              // ignore
            }
            void patchEqSnapshot(connectionId, { [slot]: null } as Partial<Record<EqSlot, string | null>>);
          }

          continue;
        }
      }
    };

    window.addEventListener('game:terminal-data', onTerminal as EventListener);
    return () => {
      console.debug('[eq-delta] hook unmounted', { connectionId });
      window.removeEventListener('game:terminal-data', onTerminal as EventListener);
    };
  }, [connectionId]);
}
