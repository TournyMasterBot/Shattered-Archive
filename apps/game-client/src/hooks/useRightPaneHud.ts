// apps/game-client/src/hooks/useRightPaneHud.ts
import { useEffect, useRef, useState } from 'react';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';

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

function toNum(x: unknown): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function applyVitalsPatch(prev: VitalsState, detail: unknown): VitalsState {
  // Supports:
  // - legacy: { hp, hpMax, mp, mpMax, stamina, staminaMax }
  // - GMCP char_data: { hp, max_hp, mana, max_mana, move, max_move }
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

function makeInstanceKey(prefix: string): string {
  // stable-enough randomness for per-mount uniqueness
  return `${prefix}::${Math.random().toString(16).slice(2)}`;
}

/**
 * Player vitals from GMCP.
 *
 * Source of truth:
 *  - "game:char-data"
 *
 * IMPORTANT:
 * Multiple components can mount this hook (RightSidebar + FocusBar).
 * Listener keys MUST be unique per instance, otherwise one will clobber the other.
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

  const keyRef = useRef<string>(makeInstanceKey('useVitalsState::game:char-data'));

  useEffect(() => {
    const disposeChar = ListenEvent<any>(
      'game:char-data',
      (payload) => {
        setVitals((prev) => applyVitalsPatch(prev, payload));
      },
      { key: keyRef.current },
    );

    return () => {
      try {
        disposeChar?.();
      } catch {
        // ignore
      }
    };
  }, []);

  return vitals;
}

/**
 * Enemy HUD state.
 */
export function useEnemyHudState(): EnemyHudState {
  const [state, setState] = useState<EnemyHudState>({
    visible: false,
    label: '',
    pct: 0,
    statusText: '',
  });

  const keyRef = useRef<string>(makeInstanceKey('useEnemyHudState::event:enemy-hp'));

  // TMB TODO : This is probably the wrong event to listen to now,
  // review for correct event
  useEffect(() => {
    const dispose = ListenEvent<any>(
      'event:enemy-hp',
      (payload) => {
        const d = isRecord(payload) ? payload : {};

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
      },
      { key: keyRef.current },
    );

    return () => {
      try {
        dispose?.();
      } catch {
        // ignore
      }
    };
  }, []);

  return state;
}

/**
 * Affects state.
 *
 * Supported events:
 *   game:affects-sync   – full replace: { affects: AffectEntry[] }
 *   game:affects-add    – add/update:   { affect: AffectEntry }
 *   game:affects-remove – remove by id: { id: string }
 */
export function useAffectsState(): AffectEntry[] {
  const [affects, setAffects] = useState<AffectEntry[]>([]);

  const syncKeyRef = useRef<string>(makeInstanceKey('useAffectsState::game:affects-sync'));
  const addKeyRef = useRef<string>(makeInstanceKey('useAffectsState::game:affects-add'));
  const remKeyRef = useRef<string>(makeInstanceKey('useAffectsState::game:affects-remove'));

  useEffect(() => {
    const disposeSync = ListenEvent<any>(
      'game:affects-sync',
      (payload) => {
        const d = isRecord(payload) ? payload : {};
        const raw = (d as any).affects;

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
      },
      { key: syncKeyRef.current },
    );

    const disposeAdd = ListenEvent<any>(
      'game:affects-add',
      (payload) => {
        const d = isRecord(payload) ? payload : {};
        const raw = (d as any).affect;

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
      },
      { key: addKeyRef.current },
    );

    const disposeRemove = ListenEvent<any>(
      'game:affects-remove',
      (payload) => {
        const d = isRecord(payload) ? payload : {};
        const id = typeof (d as any).id === 'string' ? String((d as any).id) : '';
        if (!id) return;

        setAffects((prev) => prev.filter((a) => a.id !== id));
      },
      { key: remKeyRef.current },
    );

    return () => {
      try {
        disposeSync?.();
      } catch {}
      try {
        disposeAdd?.();
      } catch {}
      try {
        disposeRemove?.();
      } catch {}
    };
  }, []);

  return affects;
}

/**
 * Compass exits.
 *
 * Expect:
 *   DispatchEvent('dsl:room-exits', { exits: ["N","E","S","D"] }));
 */
export function useCompassState(): CompassState {
  const [exits, setExits] = useState<Set<CompassDirection>>(new Set());

  const keyRef = useRef<string>(makeInstanceKey('useCompassState::dsl:room-exits'));

  useEffect(() => {
    const dispose = ListenEvent<any>(
      'dsl:room-exits',
      (payload) => {
        const d = isRecord(payload) ? payload : {};
        const raw = (d as any).exits;

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
      },
      { key: keyRef.current },
    );

    return () => {
      try {
        dispose?.();
      } catch {
        // ignore
      }
    };
  }, []);

  return { exits };
}
