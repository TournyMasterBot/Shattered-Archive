import type { LessonWorld } from '@shatteredarchive/copilot-core';

/**
 * The two worlds a map can belong to (the ids copilot-core already uses for lessons): `dsl` is the production game, `sandbox` is the
 * Simulacrum, the owner's own experimental MUD on the owner's own machine. A layer belongs to exactly one world and nothing here lets a room
 * of one reach the other. This is a local-only table (copilot-server never ships): no production artifact knows a second world exists.
 */
export type World = LessonWorld;
export const WORLDS: readonly World[] = ['dsl', 'sandbox'];

/**
 * The connection targets (`host:port`, as the game-server logs them) that belong to each world. The DSL is only its player port: another
 * port of the same host (`dsl-mud.org:8000`) is not the production game and is never used. The sandbox list names every address the
 * Simulacrum has been reached at (its web relay, its relay port, the docker host and this machine).
 */
export const WORLD_TARGETS: Readonly<Record<World, readonly string[]>> = {
  dsl: ['dsl-mud.org:4000'],
  sandbox: ['simulacrum.shatteredarchive.dev:4000', 'simulacrum-server.shatteredarchive.dev:65001', 'host.docker.internal:4000', 'localhost:4000'],
};

export function isWorld(value: unknown): value is World {
  return typeof value === 'string' && (WORLDS as readonly string[]).includes(value);
}

/** The world a connection target belongs to, or undefined when it is none of them (a test server, another game). */
export function worldOfTarget(target: string): World | undefined {
  return WORLDS.find((world) => WORLD_TARGETS[world].includes(target));
}
