import type { ViewSink } from './feed.js';
import { worldOfTarget, type World } from './worlds.js';

/**
 * Sends each room view to the memory of the world the connection belongs to, so the DSL's rooms and the Simulacrum's never share a layer. The
 * world is the one the CONNECTION went to (`setTarget` with the `host:port` of the connect record), never a guess from the rooms. Until a
 * connection of a known world is seen (the server started in the middle of a session, a test server, another game) views are refused, not stored:
 * a view whose world is not known must not enter any layer.
 */
export class WorldRouter implements ViewSink {
  private world: World | undefined;
  /** Views not stored because no world was known. */
  refused = 0;

  constructor(private readonly sinks: Readonly<Partial<Record<World, ViewSink>>>) {}

  /** The connection moved: `host:port` of the new one, or undefined when it closed or named no target. */
  setTarget(target: string | undefined): void {
    this.world = target === undefined ? undefined : worldOfTarget(target);
  }

  get current(): World | undefined {
    return this.world;
  }

  async apply(...args: Parameters<ViewSink['apply']>): Promise<unknown> {
    const sink = this.world === undefined ? undefined : this.sinks[this.world];
    if (sink === undefined) {
      this.refused += 1;
      return { ok: false, reason: 'no-world' };
    }
    return sink.apply(...args);
  }

  /** A login or a closed connection ends the session in every world's memory. */
  endSession(): void {
    for (const sink of Object.values(this.sinks)) sink?.endSession();
  }

  noteRefused(): void {
    const sink = this.world === undefined ? undefined : this.sinks[this.world];
    if (sink === undefined) this.refused += 1;
    else sink.noteRefused();
  }
}

/** One sink that gives every view to all of `sinks` (a walked memory and a tracer both follow the same walk). Resolves with the first one's answer. */
export function fanOut(first: ViewSink, ...rest: ViewSink[]): ViewSink {
  return {
    async apply(...args) {
      const [answer] = await Promise.all([first.apply(...args), ...rest.map((s) => s.apply(...args))]);
      return answer;
    },
    endSession() {
      first.endSession();
      for (const s of rest) s.endSession();
    },
    noteRefused() {
      first.noteRefused();
      for (const s of rest) s.noteRefused();
    },
  };
}
