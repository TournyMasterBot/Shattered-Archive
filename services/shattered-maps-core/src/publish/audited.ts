/**
 * The publisher: turns the audited map file (what the Mapper downloads) into the slices the C# site serves in production, one small
 * map file per area plus a manifest. Pure: it returns the files, the caller (scripts/publish-audited.mjs) gzips and writes them.
 *
 * The public layer carries less than the audited file on purpose:
 *   - no room history (merge before-images are internal, large, and mean nothing to a reader);
 *   - no `player` content in a room's baseline or its `was` list (a player standing somewhere is never public);
 * everything else a reader needs stays: titles, descriptions, exits, sources with their credit, the baseline of mobs and items.
 *
 * Every slice is a valid map file on its own: a link whose target is in another area (or in none) is marked `offPage`, and a link
 * is written into the slice of the area its exit starts in (the strict reader makes every link start at a live room, and every live
 * room is in an area, so no link is lost). Each slice is checked with the strict reader before anything is returned, so a bad file is
 * reported here and never reaches the site: for example a merged-away room whose surviving room is in another area cannot be
 * published, because its slice would hold an alias that ends nowhere.
 */

import { DATE_PATTERN, type Area, type Link, type MapFile, type MapSource, type Room } from '../schema.js';
import { validateMapFile } from '../validate.js';
import { areaLinksOf, type AreaLink } from '../hierarchy.js';

/** A file name the site will serve: lower-case letters and digits in groups joined by single hyphens, at most 64 characters. */
export const PUBLISH_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface PublishOptions {
  /** The day the slices were made (`YYYY-MM-DD`). The caller supplies it: this package has no clock. */
  publishedAt: string;
}

export interface PublishedArea {
  areaId: string;
  continentId: string;
  fileName: string;
  map: MapFile;
}

export interface PublishManifest {
  version: 1;
  status: 'audited';
  publishedAt: string;
  /** The distinct credits found in the sources of the published records, sorted. */
  credits: string[];
  counts: { continents: number; areas: number; subzones: number; rooms: number; links: number; offPageLinks: number };
  continents: { id: string; name: string; areas: number; rooms: number }[];
  areas: {
    id: string;
    name: string;
    continentId: string;
    file: string;
    rooms: number;
    links: number;
    offPageLinks: number;
    placement: Area['placement'];
  }[];
  /** The exits between areas (per pair and direction), so a continent can draw the lines between its boxes without loading every area. */
  areaLinks: AreaLink[];
}

export interface PublishReport {
  /** Baseline content records (and `was` records) of kind `player` that were left out. */
  playerRecordsDropped: number;
  /** Rooms whose history was left out. */
  roomHistoriesDropped: number;
}

export interface PublishResult {
  ok: boolean;
  /** What stopped the publish: the strict reader's findings on the input or on a slice, or an area id that cannot be a file name. */
  errors: string[];
  manifest: PublishManifest | null;
  areas: PublishedArea[];
  report: PublishReport;
}

export function publishFileName(areaId: string): string {
  return `${areaId}.json.gz`;
}

function stripRoom(room: Room, report: PublishReport): Room {
  const copy: Room = { ...room, exits: { ...room.exits }, sources: room.sources.map((s) => ({ ...s })) };
  if (copy.history !== undefined) {
    delete copy.history;
    report.roomHistoriesDropped += 1;
  }
  if (room.baseline) {
    const contents = room.baseline.contents.filter((c) => c.kind !== 'player');
    const was = room.baseline.was.filter((w) => w.kind !== 'player');
    report.playerRecordsDropped +=
      room.baseline.contents.length - contents.length + (room.baseline.was.length - was.length);
    copy.baseline = { ...room.baseline, days: [...room.baseline.days], contents, was };
  }
  return copy;
}

function creditsOf(sources: readonly MapSource[] | undefined, into: Set<string>): void {
  for (const s of sources ?? []) if (s.credit) into.add(s.credit);
}

export function publishAudited(map: MapFile, options: PublishOptions): PublishResult {
  const report: PublishReport = { playerRecordsDropped: 0, roomHistoriesDropped: 0 };
  const fail = (errors: string[]): PublishResult => ({ ok: false, errors, manifest: null, areas: [], report });

  if (!DATE_PATTERN.test(options.publishedAt)) return fail([`publishedAt "${options.publishedAt}" is not a date`]);
  const checked = validateMapFile(map);
  if (!checked.ok) return fail(checked.errors.map((e) => `the audited file: ${e}`));

  const roomArea = new Map<string, string>();
  const badNames: string[] = [];
  for (const continent of map.continents) {
    for (const area of continent.areas) {
      // The strict reader above already limits an id to 64 characters of the id alphabet; a file name is narrower (no . _ :).
      if (!PUBLISH_SLUG.test(area.id)) {
        badNames.push(`area "${area.id}" cannot be a file name (lower-case letters, digits and single hyphens)`);
      }
      for (const sub of area.subzones) for (const r of sub.rooms) roomArea.set(r.id, area.id);
    }
  }
  if (badNames.length > 0) return fail(badNames);

  const credits = new Set<string>();
  const areas: PublishedArea[] = [];
  const errors: string[] = [];
  const counts = { continents: 0, areas: 0, subzones: 0, rooms: 0, links: 0, offPageLinks: 0 };
  const continentSummary: PublishManifest['continents'] = [];
  const areaSummary: PublishManifest['areas'] = [];

  for (const continent of map.continents) {
    const summary = { id: continent.id, name: continent.name, areas: 0, rooms: 0 };
    for (const area of continent.areas) {
      const subzones = area.subzones.map((s) => ({ ...s, rooms: s.rooms.map((r) => stripRoom(r, report)) }));
      const links: Link[] = [];
      for (const link of map.links) {
        if (roomArea.get(link.from) !== area.id) continue;
        const offPage = link.to !== null && roomArea.get(link.to) !== area.id;
        links.push({ ...link, offPage });
        creditsOf(link.sources, credits);
      }
      creditsOf(area.sources, credits);
      let roomCount = 0;
      for (const sub of subzones) {
        roomCount += sub.rooms.length;
        for (const r of sub.rooms) creditsOf(r.sources, credits);
      }
      const slice: MapFile = {
        version: 1,
        ...(map.generatedAt !== undefined ? { generatedAt: map.generatedAt } : {}),
        continents: [{ id: continent.id, name: continent.name, areas: [{ ...area, subzones }] }],
        links,
      };
      const sliceCheck = validateMapFile(slice);
      if (!sliceCheck.ok) {
        for (const e of sliceCheck.errors.slice(0, 3)) errors.push(`area ${area.id}: ${e}`);
        continue;
      }
      const off = links.filter((l) => l.offPage).length;
      areas.push({ areaId: area.id, continentId: continent.id, fileName: publishFileName(area.id), map: slice });
      areaSummary.push({
        id: area.id,
        name: area.name,
        continentId: continent.id,
        file: publishFileName(area.id),
        rooms: roomCount,
        links: links.length,
        offPageLinks: off,
        placement: area.placement,
      });
      summary.areas += 1;
      summary.rooms += roomCount;
      counts.areas += 1;
      counts.subzones += subzones.length;
      counts.rooms += roomCount;
      counts.links += links.length;
      counts.offPageLinks += off;
    }
    continentSummary.push(summary);
    counts.continents += 1;
  }
  if (errors.length > 0) return fail(errors);

  return {
    ok: true,
    errors: [],
    manifest: {
      version: 1,
      status: 'audited',
      publishedAt: options.publishedAt,
      credits: [...credits].sort(),
      counts,
      continents: continentSummary,
      areas: areaSummary,
      areaLinks: areaLinksOf(map),
    },
    areas,
    report,
  };
}
