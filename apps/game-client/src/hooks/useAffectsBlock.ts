// apps/game-client/src/hooks/useAffectsBlock.ts
import { useEffect, useMemo, useState } from 'react';
import type { AffectData } from '@shatteredarchive/types-global';

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

  // Remove any with d <= -1, validate shape
  const filtered = arr.filter((x) => isAffectData(x) && x.d > -1) as AffectData[];

  return [...filtered].sort(sortByDurationThenName);
}

export function useAffectsBlock() {
  const [affects, setAffects] = useState<AffectData[]>([]);

  useEffect(() => {
    const onTrueUp = (ev: Event) => {
      const ce = ev as CustomEvent<any>;

      // Accept any of these shapes:
      // 1) { affects: AffectData[] }
      // 2) AffectData[]   (just in case)
      const affectsPayload = Array.isArray(ce.detail) ? ce.detail : ce.detail?.affects;

      setAffects(normalizeAffects(affectsPayload));
    };

    const onAdd = (ev: Event) => {
      const ce = ev as CustomEvent<any>;

      // Accept either single AffectData or { affect: AffectData } just in case
      const added = ce.detail?.affect ?? ce.detail;

      if (!isAffectData(added)) return;

      setAffects((prev) => normalizeAffects([...prev, added]));
    };

    const onRemoved = (ev: Event) => {
      const ce = ev as CustomEvent<any>;
      const name = String(ce.detail?.n ?? '').trim();
      if (!name) return;

      // Removes ALL items with that name
      setAffects((prev) => normalizeAffects(prev.filter((a) => a.n !== name)));
    };

    window.addEventListener('game:affects-trueup', onTrueUp as EventListener);
    window.addEventListener('game:affect-added', onAdd as EventListener);
    window.addEventListener('game:affect-removed', onRemoved as EventListener);

    return () => {
      window.removeEventListener('game:affects-trueup', onTrueUp as EventListener);
      window.removeEventListener('game:affect-added', onAdd as EventListener);
      window.removeEventListener('game:affect-removed', onRemoved as EventListener);
    };
  }, []);

  useEffect(() => {
    const onTick = () => {
      setAffects((prev) => normalizeAffects(prev.map((a) => ({ ...a, d: a.d - 1 }))));
    };

    window.addEventListener('game:tick', onTick as EventListener);
    return () => window.removeEventListener('game:tick', onTick as EventListener);
  }, []);

  const timeOfDay = useMemo(() => '', []);

  return { affects, timeOfDay };
}
