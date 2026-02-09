import { useEffect, useRef, useState } from 'react';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === 'object' && v !== null;
}

function makeInstanceKey(prefix: string): string {
  return `${prefix}::${Math.random().toString(16).slice(2)}`;
}

function getAffectName(x: unknown): string {
  if (!isRecord(x)) return '';
  const n = typeof x.n === 'string' ? x.n : '';
  const name = typeof x.name === 'string' ? x.name : '';
  return (n || name || '').trim().toLowerCase();
}

function isSanctuaryName(name: string): boolean {
  return name === 'sanctuary';
}

export function useSanctuaryActive() {
  const [hasSanctuary, setHasSanctuary] = useState(false);

  const keyTrueupRef = useRef(makeInstanceKey('useSanctuaryActive::game:affects-trueup'));
  const keyAddRef = useRef(makeInstanceKey('useSanctuaryActive::game:affect-added'));
  const keyRemoveRef = useRef(makeInstanceKey('useSanctuaryActive::game:affect-removed'));

  useEffect(() => {
    // Full snapshot: { affects: [{ n: "sanctuary", ... }, ...] }
    const offTrueup = ListenEvent<any>(
      'game:affects-trueup',
      (payload) => {
        const d = isRecord(payload) ? payload : {};
        const raw = (d as any).affects;

        if (!Array.isArray(raw)) {
          setHasSanctuary(false);
          return;
        }

        const found = raw.some((a) => isSanctuaryName(getAffectName(a)));
        setHasSanctuary(found);
      },
      { key: keyTrueupRef.current },
    );

    // Incremental add: { n: "sanctuary", ... }  (or { name: "sanctuary" })
    const offAdd = ListenEvent<any>(
      'game:affect-added',
      (payload) => {
        const name = getAffectName(payload);
        if (!name) return;
        if (isSanctuaryName(name)) setHasSanctuary(true);
      },
      { key: keyAddRef.current },
    );

    // Incremental remove: { n: "sanctuary" }  (or { name: "sanctuary" })
    const offRemove = ListenEvent<any>(
      'game:affect-removed',
      (payload) => {
        const name = getAffectName(payload);
        if (!name) return;
        if (isSanctuaryName(name)) setHasSanctuary(false);
      },
      { key: keyRemoveRef.current },
    );

    return () => {
      try {
        offTrueup?.();
      } catch {}
      try {
        offAdd?.();
      } catch {}
      try {
        offRemove?.();
      } catch {}
    };
  }, []);

  return { hasSanctuary };
}
