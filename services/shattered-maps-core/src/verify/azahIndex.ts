import { normalizeTitle } from '../identity.js';
import { DIRECTIONS, type Direction, type Link, type MapFile, type Room } from '../schema.js';

export type MatchQuality = 'exact' | 'prefix' | 'title';

export const normText = (text: string | undefined): string => (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export function dirsOf(room: Room): Set<Direction> {
  return new Set(DIRECTIONS.filter((d) => room.exits[d] !== undefined));
}

export function sameSet<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export function isSuperset<T>(big: ReadonlySet<T>, small: ReadonlySet<T>): boolean {
  for (const x of small) if (!big.has(x)) return false;
  return true;
}

export interface AzahRoomInfo {
  room: Room;
  area: string;
  title: string;
  desc: string;
  dirs: Set<Direction>;
}

export function* roomsOf(map: MapFile): Generator<{ room: Room; area: string }> {
  for (const continent of map.continents)
    for (const area of continent.areas) for (const subzone of area.subzones) for (const room of subzone.rooms) yield { room, area: area.id };
}

/**
 * Azah's map, indexed for matching what the game printed (a title, a description, the exits) to the rooms of the map. Rooms are never
 * identified by title alone (titles repeat across the world): the text match is the title AND the description (exact, then the first
 * `prefixChars` characters), and only a view with no description falls back to the title.
 */
export class AzahIndex {
  readonly rooms = new Map<string, AzahRoomInfo>();
  readonly links: Map<string, Link>;
  private readonly byTitle = new Map<string, string[]>();
  private readonly byExact = new Map<string, string[]>();
  private readonly byPrefix = new Map<string, string[]>();

  constructor(
    azah: MapFile,
    private readonly prefixChars: number,
  ) {
    this.links = new Map(azah.links.map((l) => [l.id, l]));
    const push = (map: Map<string, string[]>, key: string, id: string): void => {
      const list = map.get(key);
      if (list === undefined) map.set(key, [id]);
      else list.push(id);
    };
    for (const { room, area } of roomsOf(azah)) {
      if (room.aliasOf !== undefined) continue;
      const info: AzahRoomInfo = { room, area, title: normalizeTitle(room.title), desc: normText(room.description), dirs: dirsOf(room) };
      this.rooms.set(room.id, info);
      push(this.byTitle, info.title, room.id);
      if (info.desc !== '') {
        push(this.byExact, `${info.title}|${info.desc}`, room.id);
        push(this.byPrefix, `${info.title}|${info.desc.slice(0, prefixChars)}`, room.id);
      }
    }
  }

  info(id: string): AzahRoomInfo {
    return this.rooms.get(id) as AzahRoomInfo;
  }

  /** Where Azah's exit from `id` in `dir` leads, or undefined (no such exit, or a target nobody knows). */
  target(id: string, dir: Direction): string | undefined {
    const linkId = this.info(id).room.exits[dir];
    return linkId === undefined ? undefined : ((this.links.get(linkId) as Link).to ?? undefined);
  }

  /** The rooms a printed view fits by its text, and how well; `undefined` when no room has that title. `title` and `description` are raw. */
  textMatches(title: string, description: string | undefined): { ids: string[]; quality: MatchQuality } | undefined {
    const t = normalizeTitle(title);
    const d = normText(description);
    if (d !== '') {
      const exact = this.byExact.get(`${t}|${d}`);
      if (exact !== undefined) return { ids: exact, quality: 'exact' };
      const prefix = this.byPrefix.get(`${t}|${d.slice(0, this.prefixChars)}`);
      if (prefix !== undefined) return { ids: prefix, quality: 'prefix' };
    }
    const byTitle = this.byTitle.get(t);
    return byTitle === undefined ? undefined : { ids: byTitle, quality: 'title' };
  }

  /** Of `ids`, the rooms whose exits fit `dirs` best: the same exits, else Azah has more, else any. */
  bestByExits(ids: readonly string[], dirs: ReadonlySet<Direction>): string[] {
    const rank = (id: string): number => {
      const have = this.info(id).dirs;
      return sameSet(have, dirs) ? 2 : isSuperset(have, dirs) ? 1 : 0;
    };
    let best = 0;
    for (const id of ids) best = Math.max(best, rank(id));
    return ids.filter((id) => rank(id) === best);
  }
}
