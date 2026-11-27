// apps\game-client\src\features\plugins\core-plugins\roller-stats.ts

export type RollStatsSnapshot = {
  count: number;
  average: number;
  median: number;
  min: number;
  max: number;
};

/**
 * Running statistics over the stat TOTAL of every roll the Roller has answered.
 *
 * Totals are kept as a histogram (total -> times seen), not a list, so memory stays bounded by the
 * number of distinct totals no matter how many thousands of rolls a session makes. The median is
 * read from the sorted histogram keys.
 */
export class RollStats {
  private counts = new Map<number, number>();
  private n = 0;
  private sum = 0;
  private minTotal = 0;
  private maxTotal = 0;

  add(total: number): void {
    if (!Number.isFinite(total)) return;
    this.counts.set(total, (this.counts.get(total) ?? 0) + 1);
    this.n += 1;
    this.sum += total;
    if (this.n === 1 || total > this.maxTotal) this.maxTotal = total;
    if (this.n === 1 || total < this.minTotal) this.minTotal = total;
  }

  reset(): void {
    this.counts.clear();
    this.n = 0;
    this.sum = 0;
    this.minTotal = 0;
    this.maxTotal = 0;
  }

  get count(): number {
    return this.n;
  }

  /** Null until at least one roll has been recorded. */
  snapshot(): RollStatsSnapshot | null {
    if (this.n === 0) return null;
    return { count: this.n, average: this.sum / this.n, median: this.median(), min: this.minTotal, max: this.maxTotal };
  }

  private median(): number {
    const totals = [...this.counts.keys()].sort((a, b) => a - b);
    // 0-based positions of the middle element(s): the same one twice for an odd count.
    const lowPos = Math.floor((this.n - 1) / 2);
    const highPos = Math.floor(this.n / 2);
    let seen = 0;
    let low = 0;
    let high = 0;
    for (const t of totals) {
      const c = this.counts.get(t) ?? 0;
      if (lowPos >= seen && lowPos < seen + c) low = t;
      if (highPos >= seen && highPos < seen + c) {
        high = t;
        break;
      }
      seen += c;
    }
    return (low + high) / 2;
  }
}

/** One terminal line, e.g. "Rolls 54 | avg 212.4 | median 213 | min 186 | max 241". */
export function formatRollStats(s: RollStatsSnapshot): string {
  return `Rolls ${s.count} | avg ${s.average.toFixed(1)} | median ${s.median} | min ${s.min} | max ${s.max}`;
}
