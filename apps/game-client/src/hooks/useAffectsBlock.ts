// apps/game-client/src/hooks/useAffectsBlock.ts
import { useEffect, useState } from 'react';
import type { AffectData } from '@shatteredarchive/types-global';
import { useTickData } from './useTickData';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';

function sortByDurationThenName(a: AffectData, b: AffectData) {
  const dd = a.d - b.d;
  if (dd !== 0) return dd;

  const nn = a.n.localeCompare(b.n);
  if (nn !== 0) return nn;

  const ll = (a.lc ?? '').localeCompare(b.lc ?? '');
  if (ll !== 0) return ll;

  const mm = (a.m ?? 0) - (b.m ?? 0);
  if (mm !== 0) return mm;

  return (a.t ?? 0) - (b.t ?? 0);
}

function isAffectData(x: any): x is AffectData {
  return (
    x &&
    typeof x === 'object' &&
    typeof x.n === 'string' &&
    x.n.length > 0 &&
    typeof x.d === 'number' &&
    Number.isFinite(x.d)
  );
}

function normalizeAffects(list: unknown): AffectData[] {
  const arr: any[] = Array.isArray(list) ? list : [];

  // Remove any with d <= 0, validate shape
  const filtered = arr.filter((x) => isAffectData(x) && x.d > 0) as AffectData[];

  // Deduplicate by (n, lc, m) — some spells (e.g. ghost) send multiple identical
  // modifier lines. Keep the entry with the highest remaining duration.
  const seen = new Map<string, AffectData>();
  for (const a of filtered) {
    const key = `${a.n}|${a.lc ?? ''}|${a.m ?? 0}`;
    const existing = seen.get(key);
    if (!existing || a.d > existing.d) {
      seen.set(key, a);
    }
  }

  return [...seen.values()].sort(sortByDurationThenName);
}

export function useAffectsBlock() {
  const [affects, setAffects] = useState<AffectData[]>([]);
  const { timeOfDay } = useTickData();

  useEffect(() => {
    const offTrueUp = ListenEvent<any>(
      'game:affects-trueup',
      (payload) => {
        const affectsPayload = Array.isArray(payload) ? payload : payload?.affects;
        setAffects(normalizeAffects(affectsPayload));
      },
      { key: 'useAffectsBlock:shatteredarchive:affects-trueup' },
    );

    const offAdd = ListenEvent<any>(
      'game:affect-added',
      (payload) => {
        const added = payload?.affect ?? payload;
        if (!isAffectData(added)) return;

        setAffects((prev) => {
          // Replace the first existing entry with matching (n, lc, m) so that
          // re-applying an affect refreshes its duration rather than stacking.
          // If no match found, append as a new entry.
          let replaced = false;
          const next = prev.map((a) => {
            if (!replaced && a.n === added.n && a.lc === added.lc && a.m === added.m) {
              replaced = true;
              return added;
            }
            return a;
          });
          if (!replaced) next.push(added);
          return normalizeAffects(next);
        });
      },
      { key: 'useAffectsBlock:shatteredarchive:affect-added' },
    );

    const offRemoved = ListenEvent<any>(
      'game:affect-removed',
      (payload) => {
        const name = String(payload?.n ?? '').trim();
        if (!name) return;

        // Removes ALL items with that name
        setAffects((prev) => normalizeAffects(prev.filter((a) => a.n !== name)));
      },
      { key: 'useAffectsBlock:shatteredarchive:affect-removed' },
    );

    return () => {
      offTrueUp();
      offAdd();
      offRemoved();
    };
  }, []);

  useEffect(() => {
    const offTick = ListenEvent<any>(
      'game:tick',
      () => {
        setAffects((prev) => normalizeAffects(prev.map((a) => ({ ...a, d: a.d - 1 }))));
      },
      { key: 'useAffectsBlock:shatteredarchive:tick' },
    );

    return () => {
      offTick();
    };
  }, []);

  return { affects, timeOfDay };
}
