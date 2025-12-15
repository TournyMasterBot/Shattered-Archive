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

function toNum(x: any): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function applyVitalsPatch(prev: VitalsState, d: any): VitalsState {
  // Supports BOTH shapes:
  // - your legacy custom event: { hp, hpMax, mp, mpMax, stamina, staminaMax } (+ mv/mvMax)
  // - GMCP char_data payload: { hp, max_hp, mana, max_mana, move, max_move }
  const hp = toNum(d?.hp);
  const hpMax = toNum(d?.hpMax ?? d?.max_hp);

  const mp = toNum(d?.mp ?? d?.mana);
  const mpMax = toNum(d?.mpMax ?? d?.max_mana);

  const stamina = toNum(d?.stamina ?? d?.mv ?? d?.move);
  const staminaMax = toNum(d?.staminaMax ?? d?.mvMax ?? d?.max_move);

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
    const handlerGmcpVitals = (ev: Event) => {
      const ce = ev as CustomEvent<any>;
      const d = ce.detail || {};
      setVitals((prev) => applyVitalsPatch(prev, d));
    };

    const handlerCharData = (ev: Event) => {
      const ce = ev as CustomEvent<any>;
      const d = ce.detail || {};
      setVitals((prev) => applyVitalsPatch(prev, d));
    };

    window.addEventListener('game:gmcp-vitals', handlerGmcpVitals as EventListener);
    window.addEventListener('game:char-data', handlerCharData as EventListener);

    return () => {
      window.removeEventListener('game:gmcp-vitals', handlerGmcpVitals as EventListener);
      window.removeEventListener('game:char-data', handlerCharData as EventListener);
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
      const ce = ev as CustomEvent<any>;
      const d = ce.detail || {};
      setState((prev) => ({
        visible: typeof d.visible === 'boolean' ? d.visible : prev.visible,
        label: typeof d.label === 'string' ? d.label : prev.label,
        pct: typeof d.pct === 'number' ? Math.max(0, Math.min(100, d.pct)) : prev.pct,
        statusText: typeof d.statusText === 'string' ? d.statusText : prev.statusText,
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
      const ce = ev as CustomEvent<any>;
      const list = Array.isArray(ce.detail?.affects) ? (ce.detail.affects as AffectEntry[]) : [];
      setAffects(list);
    };

    const addHandler = (ev: Event) => {
      const ce = ev as CustomEvent<any>;
      const a = ce.detail?.affect as AffectEntry | undefined;
      if (!a || !a.id) return;

      setAffects((prev) => {
        const idx = prev.findIndex((x) => x.id === a.id);
        if (idx === -1) return [...prev, a];
        const next = [...prev];
        next[idx] = a;
        return next;
      });
    };

    const removeHandler = (ev: Event) => {
      const ce = ev as CustomEvent<any>;
      const id = ce.detail?.id as string | undefined;
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
      const ce = ev as CustomEvent<any>;
      const raw = ce.detail?.exits as string[] | undefined;
      if (!raw) {
        setExits(new Set());
        return;
      }

      const next = new Set<CompassDirection>();
      for (const dir of raw) {
        const up = String(dir).toUpperCase();
        if (['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'U', 'D'].includes(up)) {
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
