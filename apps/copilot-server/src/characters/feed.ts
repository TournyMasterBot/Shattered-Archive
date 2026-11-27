import type { FeedEvent } from '@shatteredarchive/copilot-core';
import type { CharacterService } from './service.js';
import { WhoisicWatcher } from './whoisicWatcher.js';

export interface CharacterFeed {
  /** Give the registry a batch of feed events: logins, session ends and `whoisic` output. */
  handle(events: readonly FeedEvent[]): Promise<void>;
  /** End of a pass: close a `whoisic` block that has stopped growing. */
  settle(now: number): Promise<void>;
}

/**
 * Connects the log feed to the character registry. This is the only place a login's real name leaves the pipeline: it goes straight
 * to `CharacterService.onLogin`.
 */
export function createCharacterFeed(service: CharacterService, watcher: WhoisicWatcher = new WhoisicWatcher()): CharacterFeed {
  return {
    async handle(events) {
      for (const event of events) {
        if (event.type === 'login') await service.onLogin(event.name);
        else if (event.type === 'session' && event.state === 'closed') service.onSessionClosed();
      }
      for (const record of watcher.feed(events)) await service.onWhoisic(record);
    },
    async settle(now) {
      for (const record of watcher.settle(now)) await service.onWhoisic(record);
    },
  };
}
