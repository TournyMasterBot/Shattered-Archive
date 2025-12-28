// apps/game-client/src/hooks/useRightPaneHud.ts
import { useEffect, useState } from 'react';

/** Re-export so existing imports keep working */
export { useTickTimer } from './useTickTimer';

/** Directions supported by the compass. */
export type CompassDirection = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' | 'U' | 'D';

export interface VitalsState {
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  stamina: number;
  staminaMax: number;
}

export interface EnemyHudState {
  visible: boolean;
  label: string;
  pct: number; // 0–100
  statusText?: string;
}

export interface AffectEntry {
  id: string; // stable key (e.g. from GMCP, or hash of name+location)
  name: string;
  summary?: string;
}

/** Compass exits state. */
export interface CompassState {
  exits: Set<CompassDirection>;
}

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === 'object' && v !== null;
}

function getDetail(ev: Event): unknown {
  // We accept any CustomEvent payloads, but we don't assume the shape.
  const ce = ev as CustomEvent<unknown>;
  return ce.detail;
}

function toNum(x: unknown): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function applyVitalsPatch(prev: VitalsState, detail: unknown): VitalsState {
  // Supports BOTH shapes:
  // - legacy custom event: { hp, hpMax, mp, mpMax, stamina, staminaMax } (+ mv/mvMax)
  // - GMCP char_data payload: { hp, max_hp, mana, max_mana, move, max_move }
  const d = isRecord(detail) ? detail : {};

  const hp = toNum(d.hp);
  const hpMax = toNum(d.hpMax ?? d.max_hp);

  const mp = toNum(d.mp ?? d.mana);
  const mpMax = toNum(d.mpMax ?? d.max_mana);

  const stamina = toNum(d.stamina ?? d.mv ?? d.move);
  const staminaMax = toNum(d.staminaMax ?? d.mvMax ?? d.max_move);

  return {
    hp: hp ?? prev.hp,
    hpMax: hpMax ?? prev.hpMax,
    mp: mp ?? prev.mp,
    mpMax: mpMax ?? prev.mpMax,
    stamina: stamina ?? prev.stamina,
    staminaMax: staminaMax ?? prev.staminaMax,
  };
}

/**
 * Player vitals from GMCP.
 *
 * Supports:
 *  - "game:char-data" (from useGameConnection's GMCP char_data)
 *  - "game:gmcp-vitals" (legacy/custom bridge, kept for compatibility)
 */
export function useVitalsState(): VitalsState {
  const [vitals, setVitals] = useState<VitalsState>({
    hp: 0,
    hpMax: 0,
    mp: 0,
    mpMax: 0,
    stamina: 0,
    staminaMax: 0,
  });

  useEffect(() => {
    const handler = (ev: Event) => {
      const d = getDetail(ev);
      setVitals((prev) => applyVitalsPatch(prev, d));
    };

    window.addEventListener('game:gmcp-vitals', handler as EventListener);
    window.addEventListener('game:char-data', handler as EventListener);

    return () => {
      window.removeEventListener('game:gmcp-vitals', handler as EventListener);
      window.removeEventListener('game:char-data', handler as EventListener);
    };
  }, []);

  return vitals;
}

/**
 * Enemy HUD state.
 *
 * Expect events like:
 *   window.dispatchEvent(new CustomEvent("dsl:enemy-hp", {
 *     detail: { visible: true, label: "an angry kobold", pct: 45, statusText: "wounded" }
 *   }));
 */
export function useEnemyHudState(): EnemyHudState {
  const [state, setState] = useState<EnemyHudState>({
    visible: false,
    label: '',
    pct: 0,
    statusText: '',
  });

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = getDetail(ev);
      const d = isRecord(detail) ? detail : {};

      const visible = typeof d.visible === 'boolean' ? d.visible : undefined;
      const label = typeof d.label === 'string' ? d.label : undefined;

      const pctRaw = typeof d.pct === 'number' ? d.pct : toNum(d.pct);
      const pct = typeof pctRaw === 'number' ? Math.max(0, Math.min(100, pctRaw)) : undefined;

      const statusText = typeof d.statusText === 'string' ? d.statusText : undefined;

      setState((prev) => ({
        visible: visible ?? prev.visible,
        label: label ?? prev.label,
        pct: pct ?? prev.pct,
        statusText: statusText ?? prev.statusText,
      }));
    };

    window.addEventListener('dsl:enemy-hp', handler as EventListener);
    return () => window.removeEventListener('dsl:enemy-hp', handler as EventListener);
  }, []);

  return state;
}

/**
 * Affects state.
 *
 * Supported events:
 *   dsl:affects-sync   – full replace: { affects: AffectEntry[] }
 *   dsl:affects-add    – add/update:   { affect: AffectEntry }
 *   dsl:affects-remove – remove by id: { id: string }
 */
export function useAffectsState(): AffectEntry[] {
  const [affects, setAffects] = useState<AffectEntry[]>([]);

  useEffect(() => {
    const syncHandler = (ev: Event) => {
      const detail = getDetail(ev);
      const d = isRecord(detail) ? detail : {};
      const raw = d.affects;

      const list: AffectEntry[] = Array.isArray(raw)
        ? raw
            .filter((x): x is AnyRecord => isRecord(x))
            .map((x) => ({
              id: typeof x.id === 'string' ? x.id : '',
              name: typeof x.name === 'string' ? x.name : '',
              summary: typeof x.summary === 'string' ? x.summary : undefined,
            }))
            .filter((x) => x.id.length > 0 && x.name.length > 0)
        : [];

      setAffects(list);
    };

    const addHandler = (ev: Event) => {
      const detail = getDetail(ev);
      const d = isRecord(detail) ? detail : {};
      const raw = d.affect;

      if (!isRecord(raw)) return;

      const a: AffectEntry = {
        id: typeof raw.id === 'string' ? raw.id : '',
        name: typeof raw.name === 'string' ? raw.name : '',
        summary: typeof raw.summary === 'string' ? raw.summary : undefined,
      };

      if (!a.id || !a.name) return;

      setAffects((prev) => {
        const idx = prev.findIndex((x) => x.id === a.id);
        if (idx === -1) return [...prev, a];
        const next = [...prev];
        next[idx] = a;
        return next;
      });
    };

    const removeHandler = (ev: Event) => {
      const detail = getDetail(ev);
      const d = isRecord(detail) ? detail : {};
      const id = typeof d.id === 'string' ? d.id : '';
      if (!id) return;
      setAffects((prev) => prev.filter((a) => a.id !== id));
    };

    window.addEventListener('dsl:affects-sync', syncHandler as EventListener);
    window.addEventListener('dsl:affects-add', addHandler as EventListener);
    window.addEventListener('dsl:affects-remove', removeHandler as EventListener);

    return () => {
      window.removeEventListener('dsl:affects-sync', syncHandler as EventListener);
      window.removeEventListener('dsl:affects-add', addHandler as EventListener);
      window.removeEventListener('dsl:affects-remove', removeHandler as EventListener);
    };
  }, []);

  return affects;
}

/**
 * Compass exits.
 *
 * Expect:
 *   window.dispatchEvent(new CustomEvent("dsl:room-exits", {
 *     detail: { exits: ["N","E","S","D"] }
 *   }));
 */
export function useCompassState(): CompassState {
  const [exits, setExits] = useState<Set<CompassDirection>>(new Set());

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = getDetail(ev);
      const d = isRecord(detail) ? detail : {};
      const raw = d.exits;

      if (!Array.isArray(raw)) {
        setExits(new Set());
        return;
      }

      const next = new Set<CompassDirection>();
      for (const dir of raw) {
        const up = String(dir).toUpperCase();
        if (
          up === 'N' ||
          up === 'S' ||
          up === 'E' ||
          up === 'W' ||
          up === 'NE' ||
          up === 'NW' ||
          up === 'SE' ||
          up === 'SW' ||
          up === 'U' ||
          up === 'D'
        ) {
          next.add(up as CompassDirection);
        }
      }

      setExits(next);
    };

    window.addEventListener('dsl:room-exits', handler as EventListener);
    return () => window.removeEventListener('dsl:room-exits', handler as EventListener);
  }, []);

  return { exits };
}
