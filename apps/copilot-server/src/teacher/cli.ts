import { MAX_PERSONA_WHY, PERSONA_FIELDS, buildPersonaFeedbackSummary, type EscalationTicket, type PersonaField } from '@shatteredarchive/copilot-core';
import { isLocalModelUrl } from '../models/ollama.js';

export const DEFAULT_API = 'https://copilot.shatteredarchive.dev';

export interface CliIo {
  fetch: typeof fetch;
  readFile: (path: string) => Promise<string>;
  out: (line: string) => void;
  err: (line: string) => void;
  env: Record<string, string | undefined>;
  /** The clock, for the id and time of a ticket the command files (default Date.now). */
  now?: () => number;
}

const USAGE = [
  'usage: teacher <command>',
  '  export [--ticket <id> ...]   write a scrubbed audit bundle (default: every open ticket, oldest first)',
  '  import <finding.json>        hand a finding to the server (it resolves the ticket)',
  '  accept <ticket id>           the OWNER accepts the finding for a ticket (a teaching session never runs this)',
  '  persona-feedback <codename> <field> <why...>   file a persona-feedback ticket (the persona of that character is off in that field)',
  '  metrics                      the training counts',
  'The server is COPILOT_API (default https://copilot.shatteredarchive.dev); only this machine, a private network or *.shatteredarchive.dev.',
].join('\n');

/** The local Copilot server only: this machine, a private network, a Docker service name, or the dev domain. */
export function isAllowedApi(value: string): boolean {
  if (isLocalModelUrl(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '' && /^([a-z0-9-]+\.)*shatteredarchive\.dev$/i.test(url.hostname);
  } catch {
    return false;
  }
}

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

/** A certificate problem is not "the server is down": the dev vhost uses a local (mkcert) certificate the system must trust. */
function isCertificateProblem(error: unknown): boolean {
  const cause = typeof error === 'object' && error !== null ? (error as { cause?: { code?: unknown } }).cause : undefined;
  return typeof cause?.code === 'string' && /CERT|SIGNATURE|SELF_SIGNED/.test(cause.code);
}

/**
 * The teaching commands as a thin client of the Copilot server: the server is the only writer of its ledger, so a bundle, a finding
 * and an acceptance are requests to it, never edits of its files. Returns the exit code: 0 done, 1 the server refused or was not
 * reachable, 2 a mistake in the command line or the file.
 */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  // `pnpm run <script> -- <args>` may hand the separator on to the script: it is not an argument
  const [command, ...args] = argv.filter((a, i) => a !== '--' || argv.indexOf('--') !== i);
  const base = (io.env.COPILOT_API ?? DEFAULT_API).replace(/\/+$/, '');
  if (!isAllowedApi(base)) {
    io.err('COPILOT_API must be this machine, a private network or *.shatteredarchive.dev');
    return 2;
  }

  let certificateProblem = false;
  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Reply | undefined> {
    try {
      const res = await io.fetch(`${base}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const parsed: unknown = await res.json().catch(() => ({}));
      return { status: res.status, body: typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {} };
    } catch (error) {
      certificateProblem = isCertificateProblem(error);
      return undefined;
    }
  }

  const refused = (reply: Reply): number => {
    const details = Array.isArray(reply.body.details) ? ` (${reply.body.details.join('; ')})` : '';
    io.err(`the server answered ${reply.status}: ${String(reply.body.error ?? 'no reason given')}${details}`);
    return 1;
  };
  const unreachable = (): number => {
    io.err(
      certificateProblem
        ? 'the Copilot server answered with a certificate this machine does not trust (the dev certificate is a local mkcert one: run mkcert -install, or set NODE_EXTRA_CA_CERTS to its root certificate)'
        : 'the Copilot server cannot be reached; tickets wait, nothing is lost',
    );
    return 1;
  };

  if (command === 'export') {
    const ids: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] !== '--ticket' || args[i + 1] === undefined) {
        io.err(USAGE);
        return 2;
      }
      ids.push(args[i + 1]);
      i += 1;
    }
    const reply = await call('POST', '/bundles', ids.length > 0 ? { ticketIds: ids } : {});
    if (reply === undefined) return unreachable();
    if (reply.status !== 200 && reply.status !== 201) return refused(reply);
    if (reply.body.written !== true) {
      io.out('No open tickets: nothing written.');
      return 0;
    }
    io.out(`Bundle ${String(reply.body.id)} written to ${String(reply.body.folder)} (${String(reply.body.tickets)} tickets).`);
    io.out(String(reply.body.summary));
    return 0;
  }

  if (command === 'import') {
    if (args.length !== 1) {
      io.err(USAGE);
      return 2;
    }
    let finding: unknown;
    try {
      finding = JSON.parse(await io.readFile(args[0]));
    } catch {
      io.err('the finding file cannot be read or is not JSON');
      return 2;
    }
    const reply = await call('POST', '/findings', finding);
    if (reply === undefined) return unreachable();
    if (reply.status !== 200 && reply.status !== 201) return refused(reply);
    io.out(`Finding ${String(reply.body.id)} ${reply.body.written === true ? 'stored' : 'was already stored'}; its ticket is resolved. Tell the owner to review the artifacts and accept.`);
    return 0;
  }

  if (command === 'accept') {
    if (args.length !== 1) {
      io.err(USAGE);
      return 2;
    }
    const reply = await call('POST', `/tickets/${encodeURIComponent(args[0])}/accept`, { acceptedBy: 'owner' });
    if (reply === undefined) return unreachable();
    if (reply.status !== 200) return refused(reply);
    io.out(reply.body.written === true ? `Accepted. ${String(reply.body.lessonsChanged)} proposed lesson(s) settled.` : 'Already accepted; nothing changed.');
    return 0;
  }

  if (command === 'persona-feedback') {
    const [codename, field, ...why] = args;
    const summary = codename === undefined || field === undefined ? null : buildPersonaFeedbackSummary({ codename, field: field as PersonaField, why: why.join(' ') });
    if (summary === null || codename === undefined) {
      io.err(`${USAGE}\nthe fields are: ${PERSONA_FIELDS.join(', ')}; the why is 1 to ${MAX_PERSONA_WHY} characters`);
      return 2;
    }
    const at = (io.now ?? Date.now)();
    const ticket: EscalationTicket = {
      id: `pf-${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: at,
      character: codename,
      reason: 'persona-feedback',
      sphere: 'interaction',
      kind: 'unknown',
      situationKey: `persona:${codename}`,
      summary,
      status: 'open',
    };
    const reply = await call('POST', '/tickets', ticket);
    if (reply === undefined) return unreachable();
    if (reply.status !== 200 && reply.status !== 201) return refused(reply);
    io.out(`Filed ${String(reply.body.id)}: persona feedback for ${codename} (${field}). It waits for a teaching session.`);
    return 0;
  }

  if (command === 'metrics' && args.length === 0) {
    const reply = await call('GET', '/metrics/training');
    if (reply === undefined) return unreachable();
    if (reply.status !== 200) return refused(reply);
    io.out(JSON.stringify(reply.body.totals));
    return 0;
  }

  io.err(USAGE);
  return 2;
}
