import net from 'net';

import { SERVICE_TIERS, tierRank } from '@shatteredarchive/services-server';

import { consumeAccessCode } from './access-codes.js';
import type { RoleStore } from './role-store.js';

/**
 * AI-ANNOTATION
 * @ai-summary The gated TCP relay (.ai-plans/20260816-0701-simulacrum-mud-wiring.md Step 1,
 *   correction 5): on connect, prompts for a trusted+-minted access code, reads exactly one
 *   line, and validates it BEFORE ever dialing merc-mud — an anonymous or under-tier attempt
 *   never reaches the engine. `admit()` is deliberately isolated (not inlined in the
 *   connection handler) so the follow-on plan (master-account linking) can extend it with an
 *   in-band accountId preamble without touching the gate itself.
 * @ai-public createRelay, validateAccessCode, admit
 * @ai-notes The role-store re-check inside validateAccessCode is LIVE, not cached against the
 *   code's mint time — a grant revoked via mud-builder-client's Roles tab (shared roles.json,
 *   see role-store.ts) takes effect on the very next connection attempt.
 */

const PROMPT = 'Simulacrum access code: ';
const REJECTED = 'Access denied: a valid trusted-tier access code is required. Connection closed.\r\n';

export interface RelayDeps {
  accessCodesPath: string;
  roleStore: RoleStore;
  mercMudHost: string;
  mercMudPort: number;
  promptTimeoutMs: number;
}

export interface RelayHandle {
  server: net.Server;
  /** Exposed for the follow-on plan to extend with an in-band accountId preamble. */
  admit: (accountId: string, username: string, socket: net.Socket) => void;
}

/** Reads one line (up to \n) from a socket; resolves null on timeout or an early close. */
function readLine(socket: net.Socket, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let buffer = '';
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      socket.removeListener('data', onData);
      socket.removeListener('close', onClose);
      clearTimeout(timer);
      resolve(value);
    };
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8');
      const idx = buffer.indexOf('\n');
      if (idx !== -1) finish(buffer.slice(0, idx).replace(/\r$/, ''));
    };
    const onClose = (): void => finish(null);
    const timer = setTimeout(() => finish(null), timeoutMs);
    socket.on('data', onData);
    socket.on('close', onClose);
  });
}

/**
 * Consumes (single-use) and validates an access code: it must exist, be unexpired, AND its
 * account must still hold trusted+ tier right now — not merely at mint time.
 */
export function validateAccessCode(
  deps: Pick<RelayDeps, 'accessCodesPath' | 'roleStore'>,
  code: string,
): { accountId: string; username: string } | null {
  const record = consumeAccessCode(deps.accessCodesPath, code);
  if (!record) return null;
  const tier = deps.roleStore.tierFor(record.accountId);
  if (tierRank(SERVICE_TIERS, tier) > tierRank(SERVICE_TIERS, 'trusted')) return null;
  return { accountId: record.accountId, username: record.username };
}

export function createRelay(deps: RelayDeps): RelayHandle {
  function admit(accountId: string, username: string, socket: net.Socket): void {
    const upstream = net.connect(deps.mercMudPort, deps.mercMudHost);
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    upstream.once('connect', () => {
      // Follow-on plan (.ai-plans/20260816-0724-simulacrum-master-account-characters.md Step 1):
      // a private, internal-only preamble merc-mud's C side peeks at before dispatching to
      // CON_GET_NAME — merc-mud's port is never reachable from outside sa-shared/loopback (the
      // sibling plan's Step 4), so this is safe to trust. Sent BEFORE the pipe starts, so it
      // arrives as the literal first bytes on the connection, ahead of anything the human types.
      upstream.write(`#SIMACCT ${accountId} ${username}\n`);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    upstream.once('close', () => socket.destroy());
    socket.once('close', () => upstream.destroy());
  }

  const server = net.createServer((socket) => {
    socket.write(PROMPT);
    void readLine(socket, deps.promptTimeoutMs).then((line) => {
      if (socket.destroyed) return;
      const code = (line ?? '').trim();
      const identity = code ? validateAccessCode(deps, code) : null;
      if (!identity) {
        socket.end(REJECTED);
        return;
      }
      admit(identity.accountId, identity.username, socket);
    });
  });

  return { server, admit };
}
