import type { Lesson, LessonWorld, Mode, Sphere } from '@shatteredarchive/copilot-core';
import type { Situation } from './situation.js';
import type { SphereTable } from './spheres.js';

/** Facts for a sphere from the archive (the C# `/api/agent/*` endpoints): short lines. May fail or find nothing. */
export type Lookup = (sphere: Sphere, situation: Situation, signal?: AbortSignal) => Promise<string[]>;

export interface Route {
  sphere: Sphere;
  /** What the archive said about this situation, from the sphere that found something. */
  facts: string[];
  /** Accepted lessons for this exact situation. A proposed lesson is never here (E6). */
  lessons: Lesson[];
  /** Every sphere that was asked, in order. */
  tried: Sphere[];
  /** What to try in this room, from the hint tiers (learned, instant, local, escalated): short lines, whatever sphere the situation belongs to. Absent: none. */
  hints?: string[];
}

export interface RouterDeps {
  spheres: SphereTable;
  lookup: Lookup;
  /** All lessons known to the server; only the accepted ones for the situation are used. */
  lessons: () => readonly Lesson[];
  /**
   * The world of the current connection. A lesson applies only in its own world: a Simulacrum lesson never steers the DSL and a DSL lesson
   * never steers the Simulacrum. Absent or unknown: only the DSL's lessons apply (a connection of unknown world is not the Simulacrum).
   */
  world?: () => LessonWorld | undefined;
  /**
   * Hints for the room the situation is in (Phase 42: the tier engine). Asked for every situation, so the hint command is used regularly and not only when the
   * model happens to be in the interaction sphere. May fail or find nothing.
   */
  hints?: (situation: Situation, signal?: AbortSignal) => Promise<string[]>;
}

const START: Record<Mode, Sphere> = { battle: 'fighting', exploration: 'world', questing: 'interaction', leveling: 'fighting' };

export function startingSphere(mode: Mode): Sphere {
  return START[mode];
}

async function ask(lookup: Lookup, sphere: Sphere, situation: Situation, signal?: AbortSignal): Promise<string[]> {
  try {
    return await lookup(sphere, situation, signal);
  } catch {
    return []; // a failing archive means "no facts", never a failed suggestion
  }
}

/**
 * Pick the sphere for a situation and gather what is known about it. Accepted lessons for the situation come first and name the
 * sphere when there is one. Otherwise the mode's sphere is asked; when it finds nothing, its neighbours are asked in order and the
 * first that finds something becomes the sphere (the neighbour hint). `start` forces the first sphere (a model that said "this is
 * not my sphere" sends it elsewhere).
 */
export async function routeSituation(situation: Situation, deps: RouterDeps, options: { start?: Sphere; signal?: AbortSignal } = {}): Promise<Route> {
  const routed = await routeSphere(situation, deps, options);
  if (deps.hints === undefined) return routed;
  try {
    const hints = await deps.hints(situation, options.signal);
    return hints.length > 0 ? { ...routed, hints } : routed;
  } catch {
    return routed; // a failing hint tier means no hints, never a failed suggestion
  }
}

async function routeSphere(situation: Situation, deps: RouterDeps, options: { start?: Sphere; signal?: AbortSignal }): Promise<Route> {
  const world = deps.world?.() ?? 'dsl';
  const lessons = deps.lessons().filter((l) => l.status === 'accepted' && l.situationKey === situation.situationKey && l.world === world);
  const first = options.start ?? lessons[0]?.sphere ?? startingSphere(situation.mode);
  const tried: Sphere[] = [first];
  let facts = await ask(deps.lookup, first, situation, options.signal);
  if (facts.length > 0 || lessons.length > 0) return { sphere: first, facts, lessons, tried };

  for (const neighbour of deps.spheres.neighbours(first)) {
    tried.push(neighbour);
    const found = await ask(deps.lookup, neighbour, situation, options.signal);
    if (found.length > 0) {
      facts = found;
      return { sphere: neighbour, facts, lessons, tried };
    }
  }
  return { sphere: first, facts: [], lessons, tried };
}
