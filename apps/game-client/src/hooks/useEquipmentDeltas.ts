import { useEffect } from 'react';
import {
  setSlotOptimistic,
  setEqSnapshot,
  getEquipmentProfile,
} from '../features/equipment/equipment-store';
import { applyWearLineToSnapshot, normalizeEqText, stripAnsi } from '../features/equipment/eq-delta-parse';

console.log('[eq-delta] useEquipmentDeltas module loaded');

export function useEquipmentDeltas(connectionId: string) {
  useEffect(() => {
    console.log('[eq-delta] hook mounted', { connectionId });

    const onTerminal = (ev: Event) => {
      const e = ev as CustomEvent<{ text?: string }>;
      const raw = e.detail?.text ?? '';

      console.debug('[eq-delta] terminal event received', { raw });

      if (!raw) return;

      const cleaned = stripAnsi(raw).replace(/\r/g, '');
      const lines = cleaned.split('\n');

      for (const lineRaw of lines) {
        const line = lineRaw.trim();
        if (!line) continue;

        console.debug('[eq-delta] processing line', { line });

        // DISARM (partial match)
        if (line.includes('DISARMS you and sends your weapon flying!')) {
          console.warn('[eq-delta] DISARM detected -> clearing wielded + secondary');
          void setSlotOptimistic(connectionId, 'wielded', null);
          void setSlotOptimistic(connectionId, 'secondary', null);
          continue;
        }

        // WIELD (primary / secondary)
        if (line.startsWith('You wield ')) {
          const isSecondary = line.includes(' as a secondary weapon.');
          const item = normalizeEqText(
            line
              .replace(/^You wield\s+/i, '')
              .replace(/\s+as a secondary weapon\.\s*$/i, '')
              .replace(/\.\s*$/i, ''),
          );

          console.info('[eq-delta] WIELD detected', { isSecondary, item });

          void setSlotOptimistic(connectionId, isSecondary ? 'secondary' : 'wielded', item || '(nothing)');
          continue;
        }

        // EQUIPMENT REMOVAL (partial match)
        if (line.startsWith('You stop using')) {
          console.warn('[eq-delta] STOP USING detected -> clearing wielded + secondary');
          void setSlotOptimistic(connectionId, 'wielded', null);
          void setSlotOptimistic(connectionId, 'secondary', null);
          continue;
        }

        // WEAR -> update full snapshot
        if (line.startsWith('You wear ')) {
          console.info('[eq-delta] WEAR detected', { line });

          const profile = getEquipmentProfile(connectionId);
          const next = applyWearLineToSnapshot(profile.snapshot, line);

          if (!next) {
            console.warn('[eq-delta] WEAR not recognized (no slot mapping)', { line });
            continue;
          }

          console.debug('[eq-delta] snapshot updated', {
            updatedAt: next.updatedAt,
            slotKeys: Object.keys(next.slots ?? {}),
          });

          void setEqSnapshot(connectionId, next);
          continue;
        }

        console.debug('[eq-delta] line ignored', { line });
      }
    };

    window.addEventListener('game:terminal-data', onTerminal as EventListener);
    return () => {
      console.log('[eq-delta] hook unmounted', { connectionId });
      window.removeEventListener('game:terminal-data', onTerminal as EventListener);
    };
  }, [connectionId]);
}
