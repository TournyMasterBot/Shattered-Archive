import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import type { AreaFile, ExternalVnumRef } from '@shatteredarchive/merc-area';

import { AreaStoreError, type AreaStore } from '../area-store.js';

/**
 * Read-only world overview: one pass over every area.lst entry aggregating the
 * header, entity counts, and reference validation, so the client dashboard is
 * a single request instead of N. Files that fail to parse are still listed
 * (with the parse error) — a broken file is exactly what the dashboard is for.
 */

export interface WorldAreaSummary {
  file: string;
  name?: string;
  credits?: string;
  minVnum?: number;
  maxVnum?: number;
  counts: {
    rooms: number;
    mobs: number;
    objects: number;
    resets: number;
    shops: number;
    specials: number;
    socials: number;
    scripts: number;
    helps: number;
  };
  /** Save-blocking reference errors (stock corpus: none). */
  errors: string[];
  /** Refs no listed area defines + exit-key soft refs — real issues only (Phase 11). */
  warnings: string[];
  /** Cross-area refs resolved against the world index — healthy links, not warnings. */
  external: ExternalVnumRef[];
  /**
   * Entities defined here whose world-wide spawn demand exceeds their tightest
   * reset limit (Phase 12b): once `limit` copies exist, further resets mostly
   * skip (db.c reset_area, 1-in-5 random override), so the item/mob becomes
   * hard to find. Empty when nothing is pressured.
   */
  limitPressure: LimitPressureItem[];
  parseError?: string;
}

export interface LimitPressureItem {
  kind: 'mob' | 'object';
  vnum: number;
  name: string;
  /** Spawn instances requested by resets across the whole world. */
  demand: number;
  /** Tightest effective limit among those resets (999 = unlimited). */
  limit: number;
}

/** db.c reset_area limit decoding for P/G/E resets: >50 = old format (6), -1 = unlimited (999). */
function effectiveObjLimit(arg2: number): number {
  if (arg2 > 50) return 6;
  if (arg2 === -1) return 999;
  return arg2;
}

function countEntities(area: AreaFile): WorldAreaSummary['counts'] {
  const counts = { rooms: 0, mobs: 0, objects: 0, resets: 0, shops: 0, specials: 0, socials: 0, scripts: 0, helps: 0 };
  for (const s of area.sections) {
    if (s.kind === 'rooms') counts.rooms += s.rooms.length;
    if (s.kind === 'mobiles') counts.mobs += s.mobiles.length;
    if (s.kind === 'objects') counts.objects += s.objects.length;
    if (s.kind === 'resets') counts.resets += s.resets.length;
    if (s.kind === 'shops') counts.shops += s.shops.length;
    if (s.kind === 'specials') counts.specials += s.specials.length;
    if (s.kind === 'socials') counts.socials += s.socials.length;
    if (s.kind === 'scripts') counts.scripts += s.scripts.length;
    if (s.kind === 'helps') counts.helps += s.helps.length;
  }
  return counts;
}

const EMPTY_COUNTS: WorldAreaSummary['counts'] = {
  rooms: 0,
  mobs: 0,
  objects: 0,
  resets: 0,
  shops: 0,
  specials: 0,
  socials: 0,
  scripts: 0,
  helps: 0,
};

export function registerWorldRoutes(app: Application, store: AreaStore): void {
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/world', (_req: Request, res: Response, next: NextFunction) => {
    try {
      // Pass 1: parse everything once; collect world-wide spawn demand vs the
      // tightest reset limit per mob/object vnum (db.c reset_area semantics).
      const parsed: { entry: ReturnType<AreaStore['listAreas']>[number]; area?: AreaFile; error?: string }[] =
        store.listAreas().map((entry) => {
          try {
            return { entry, area: store.readArea(entry.file) };
          } catch (e) {
            return { entry, error: (e as Error).message };
          }
        });

      const pressure = { mob: new Map<number, { demand: number; limit: number }>(), object: new Map<number, { demand: number; limit: number }>() };
      const bump = (kind: 'mob' | 'object', vnum: number, demand: number, limit: number): void => {
        const prev = pressure[kind].get(vnum) ?? { demand: 0, limit: 999 };
        pressure[kind].set(vnum, { demand: prev.demand + demand, limit: Math.min(prev.limit, limit) });
      };
      for (const p of parsed) {
        for (const s of p.area?.sections ?? []) {
          if (s.kind !== 'resets') continue;
          for (const r of s.resets) {
            if (r.command === 'M') bump('mob', r.arg1, 1, r.arg2);
            if (r.command === 'G' || r.command === 'E') bump('object', r.arg1, 1, effectiveObjLimit(r.arg2));
            if (r.command === 'P') bump('object', r.arg1, Math.max(1, r.arg4), effectiveObjLimit(r.arg2));
          }
        }
      }

      const areas: WorldAreaSummary[] = parsed.map(({ entry, area, error }) => {
        if (!area) {
          return {
            file: entry.file,
            counts: { ...EMPTY_COUNTS },
            errors: [],
            warnings: [],
            external: [],
            limitPressure: [],
            parseError: error,
          };
        }
        const refs = store.resolveRefs(area, entry.file);
        const limitPressure: LimitPressureItem[] = [];
        for (const s of area.sections) {
          if (s.kind === 'mobiles') {
            for (const m of s.mobiles) {
              const st = pressure.mob.get(m.vnum);
              if (st && st.limit < 999 && st.demand > st.limit) {
                limitPressure.push({ kind: 'mob', vnum: m.vnum, name: m.shortDescr, demand: st.demand, limit: st.limit });
              }
            }
          }
          if (s.kind === 'objects') {
            for (const o of s.objects) {
              const st = pressure.object.get(o.vnum);
              if (st && st.limit < 999 && st.demand > st.limit) {
                limitPressure.push({ kind: 'object', vnum: o.vnum, name: o.shortDescr, demand: st.demand, limit: st.limit });
              }
            }
          }
        }
        limitPressure.sort((a, b) => a.vnum - b.vnum);
        return {
          file: entry.file,
          name: entry.name,
          credits: entry.credits,
          minVnum: entry.minVnum,
          maxVnum: entry.maxVnum,
          counts: countEntities(area),
          errors: refs.errors,
          warnings: refs.warnings,
          external: refs.external,
          limitPressure,
        };
      });
      res.json({ areas });
    } catch (e) {
      if (e instanceof AreaStoreError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      next(e);
    }
  });
}
