/**
 * AI-ANNOTATION
 * @ai-summary Advisory in-memory presence registry (Phase 11): heartbeat(file,
 *   name) stamps "name is editing file" now; list() returns entries younger
 *   than the TTL with their age. Advisory only — never a lock.
 * @ai-public PresenceRegistry, PresenceEntry, PRESENCE_TTL_MS
 * @ai-notes Lazy expiry (stale entries drop as list() walks them) — no timers
 *   to leak, and a crashed browser simply ages out. Purely transient state:
 *   no disk writes, and the audit middleware skips /api/presence entirely.
 */

export const PRESENCE_TTL_MS = 60_000;

export interface PresenceEntry {
  file: string;
  name: string;
  ageSeconds: number;
}

export class PresenceRegistry {
  /** `${file}\n${name}` → last heartbeat (ms). \n cannot appear in either part. */
  private readonly beats = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  heartbeat(file: string, name: string): void {
    this.beats.set(`${file}\n${name}`, this.now());
  }

  /** Live entries only; anything past the TTL is dropped as it is seen. */
  list(): PresenceEntry[] {
    const at = this.now();
    const out: PresenceEntry[] = [];
    for (const [key, stamped] of this.beats) {
      const age = at - stamped;
      if (age >= PRESENCE_TTL_MS) {
        this.beats.delete(key);
        continue;
      }
      const split = key.indexOf('\n');
      out.push({ file: key.slice(0, split), name: key.slice(split + 1), ageSeconds: Math.floor(age / 1000) });
    }
    return out.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
  }
}
