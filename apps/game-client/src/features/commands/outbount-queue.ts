export type OutboundJob =
  | { kind: 'sendLine'; line: string }
  | { kind: 'repeatChain'; repeatLeft: number; chain: string[]; chainIndex: number };

export class OutboundQueue {
  private q: OutboundJob[] = [];
  private pumping = false;

  constructor(private readonly sendLine: (line: string) => void) {}

  /** Immediately drop any queued-but-not-sent jobs. */
  flushPending(): void {
    this.q.length = 0;
  }

  enqueue(job: OutboundJob): void {
    this.q.push(job);
    this.pumpSoon();
  }

  enqueueMany(jobs: OutboundJob[]): void {
    for (const j of jobs) this.q.push(j);
    this.pumpSoon();
  }

  private pumpSoon(): void {
    if (this.pumping) return;
    this.pumping = true;
    queueMicrotask(() => this.pump());
  }

  private pump(): void {
    const MAX_PER_TICK = 100;
    let sent = 0;

    while (sent < MAX_PER_TICK && this.q.length > 0) {
      const job = this.q.shift()!;
      if (job.kind === 'sendLine') {
        this.sendLine(job.line);
        sent++;
      }
    }

    this.pumping = false;
    if (this.q.length > 0) this.pumpSoon();
  }
}
