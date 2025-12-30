// apps/game-client/src/hooks/useEquipmentCapture.ts
import { useEffect, useRef } from 'react';
import { buildEqSnapshot, isEqEnd, isEqHeader } from '../features/equipment/eq-parse';
import { setEquipmentFromEq, setEqSnapshot } from '../features/equipment/equipment-store';

console.log('useEquipmentCapture module loaded');

export function useEquipmentCapture(connectionId: string) {
  const capturing = useRef(false);
  const buffer = useRef<string[]>([]);

  useEffect(() => {
    const onRaw = (ev: Event) => {
      const e = ev as CustomEvent<{ text?: string }>;
      const line = e.detail?.text ?? '';
      if (!line) return;

      const isEqHeaderLine = isEqHeader(line);
      if (isEqHeaderLine) {
        capturing.current = true;
        buffer.current = [];
        console.debug('[eq-capture] START');
        return;
      }

      if (!capturing.current) return;

      if (isEqEnd(line)) {
        capturing.current = false;
        console.debug('[eq-capture] END', { count: buffer.current.length });

        const snapshot = buildEqSnapshot(buffer.current);

        void setEqSnapshot(connectionId, snapshot);

        void setEquipmentFromEq(connectionId, {
          wielded: snapshot.slots.wielded?.rawLine ?? '(nothing)',
          secondary: snapshot.slots.secondary_weapon?.rawLine ?? '(nothing)',
          shield: snapshot.slots.worn_as_shield?.rawLine ?? '(nothing)',
          sheathed: snapshot.slots.sheathed?.rawLine ?? '(nothing)',
        });

        return;
      }

      buffer.current.push(line);
    };

    console.debug('[eq-capture] HOOK INVOKED', connectionId);
    window.addEventListener('game:terminal-data', onRaw as EventListener);
    return () => window.removeEventListener('game:terminal-data', onRaw as EventListener);
  }, [connectionId]);
}
