import { CONFIRMED_CONFIDENCE, SINGLE_TRAVERSAL_CONFIDENCE } from '../identity.js';
import { cloneJson, LIMITS, OPPOSITE, type Link, type MapFile, type MapSource, type Room } from '../schema.js';
import type { TraceReport } from './trace.js';

/**
 * Turns the verdicts of a walk (`AzahTracer.report()`) into the proposed audited map: Azah's map, with what the owner's own play showed
 * written onto it. Nothing is added and nothing is removed: a room or link Azah has stays, and one nobody walked keeps the imported
 * candidate confidence (0.4). Pure; the input is not changed.
 *
 *  - a link whose steps agreed is walked once (`candidate`, 0.6) or, when the way back agreed too, `confirmed` (0.95, `reverse`), with the
 *    number of steps and the day of the latest as `traversals` and `lastWalked`, and a `walked` source;
 *  - a link whose steps ended somewhere else is a `conflict` (confidence 0) naming the rooms the walk reached (`conflictTo`);
 *  - a room that was walked and fit gets a `walked` source with the day it was last walked;
 *  - the rest is untouched.
 */

const walkedSource = (date: string): MapSource => ({ kind: 'walked', date });

export interface ApplyOptions {
  /** `YYYY-MM-DD`: when this version of the map was made. */
  date: string;
}

export interface ApplyCounts {
  roomsWalked: number;
  linksConfirmed: number;
  linksWalkedOnce: number;
  linksConflict: number;
  linksUntouched: number;
}

export function applyTrace(
  azah: MapFile,
  report: Pick<TraceReport, 'links' | 'evidence' | 'walkedOn'>,
  options: ApplyOptions,
): { map: MapFile; counts: ApplyCounts } {
  const map = cloneJson(azah);
  map.generatedAt = options.date;
  const counts: ApplyCounts = { roomsWalked: 0, linksConfirmed: 0, linksWalkedOnce: 0, linksConflict: 0, linksUntouched: 0 };

  for (const continent of map.continents)
    for (const area of continent.areas)
      for (const subzone of area.subzones)
        for (const room of subzone.rooms as Room[]) {
          const walked = report.walkedOn[room.id];
          if (walked === undefined || room.sources.length >= LIMITS.maxSources) continue;
          room.sources.push(walkedSource(walked.last));
          counts.roomsWalked += 1;
        }

  const links = new Map<string, Link>(map.links.map((l) => [l.id, l]));
  /** The link that leaves `link.to` the opposite way, when it comes back to `link.from`. */
  const wayBack = new Map<string, Link>();
  for (const link of map.links) wayBack.set(`${link.from}|${link.dir}`, link);
  const agreed = (link: Link): boolean => report.links[link.id] === 'agree';
  /** Only asked of a link that agreed, which always has a target. */
  const returnsAgreed = (link: Link): boolean => {
    const back = wayBack.get(`${link.to as string}|${OPPOSITE[link.dir]}`);
    return back !== undefined && back.to === link.from && agreed(back);
  };

  for (const [id, link] of links) {
    const verdict = report.links[id];
    const e = report.evidence[id];
    if (e === undefined || verdict === 'unverified') {
      counts.linksUntouched += 1;
    } else if (verdict === 'agree') {
      const back = returnsAgreed(link);
      link.state = back ? 'confirmed' : 'candidate';
      link.confidence = back ? CONFIRMED_CONFIDENCE : SINGLE_TRAVERSAL_CONFIDENCE;
      link.reverse = back;
      link.traversals = Math.min(e.agree, LIMITS.maxTraversals);
      link.lastWalked = e.lastDay;
      link.sources = [...(link.sources ?? []), walkedSource(e.lastDay)].slice(-LIMITS.maxSources);
      if (back) counts.linksConfirmed += 1;
      else counts.linksWalkedOnce += 1;
    } else {
      link.state = 'conflict';
      link.confidence = 0;
      link.traversals = Math.min(e.disagree, LIMITS.maxTraversals);
      link.lastWalked = e.lastDay;
      if (e.seenTo.length > 0) link.conflictTo = e.seenTo.slice(0, LIMITS.maxConflictTargets);
      link.sources = [...(link.sources ?? []), walkedSource(e.lastDay)].slice(-LIMITS.maxSources);
      counts.linksConflict += 1;
    }
  }
  return { map, counts };
}
