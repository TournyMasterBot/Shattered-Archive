import path from 'node:path';
import { parsePersonaFeedbackSummary, type Decision, type EscalationTicket, type JsonlStore, type LedgerFs, type Lesson } from '@shatteredarchive/copilot-core';

/** A bundle holds at most this many tickets, oldest first, so a long queue is audited in bounded pieces. */
export const BUNDLE_MAX_TICKETS = 50;
/** Every free-text field is cut to this many characters after the names were replaced. */
export const EXCERPT_MAX = 300;

export interface BundleDeps {
  fs: LedgerFs;
  /** `<data dir>/bundles`; each bundle is a folder of its own. */
  dir: string;
  tickets: JsonlStore<EscalationTicket>;
  decisions: JsonlStore<Decision>;
  lessons: JsonlStore<Lesson>;
  /** Replaces every registered name with its codename and name-shaped words in player-name positions with `<name>`. */
  redact: (text: string) => string;
  now: () => number;
  newId?: () => string;
}

export interface BundleTicket {
  id: string;
  createdAt: number;
  character: string;
  reason: EscalationTicket['reason'];
  sphere: EscalationTicket['sphere'];
  kind: EscalationTicket['kind'];
  situationKey: string;
  status: EscalationTicket['status'];
  summary: string;
  /** The decision the ticket came from, when it has one (a correction the agent did not understand). */
  decision?: { id: string; outcome: Decision['outcome']; command?: string; why?: string };
  /** For a `persona-feedback` ticket: which character, which persona field, and the owner's why (names replaced, cut like every text). */
  persona?: { codename: string; field: string; why: string };
  /** Lessons the agent proposed for the same sphere and situation. They steer nothing until a finding is accepted. */
  proposedLessons: { id: string; rule: string; scope: Lesson['scope']; world: Lesson['world'] }[];
}

export interface Bundle {
  version: 1;
  id: string;
  createdAt: number;
  ticketCount: number;
  /** More open tickets exist than fit; export again after these are answered. */
  truncated: boolean;
  tickets: BundleTicket[];
}

export type ExportResult =
  | { ok: true; written: false; reason: 'no-open-tickets' }
  | { ok: true; written: true; id: string; dir: string; bundle: Bundle; summary: string }
  | { ok: false; error: 'unknown-ticket' | 'too-many-tickets' | 'write-failed' };

let counter = 0;
function defaultId(now: number): string {
  counter += 1;
  return `b-${now.toString(36)}-${counter.toString(36)}`;
}

/** One line, names replaced, cut to EXCERPT_MAX. The cut comes after the replacement, so a name is never split into a leak. */
export function excerpt(text: string, redact: (text: string) => string): string {
  const clean = redact(text).replace(/\s+/g, ' ').trim();
  return clean.length > EXCERPT_MAX ? `${clean.slice(0, EXCERPT_MAX - 1)}…` : clean;
}

function describe(ticket: BundleTicket): string {
  const lines = [
    `### ${ticket.id}: ${ticket.reason} (${ticket.sphere} / ${ticket.kind})`,
    `- Character: ${ticket.character}`,
    `- Situation: ${ticket.situationKey}`,
    `- Status: ${ticket.status}`,
    `- Summary: ${ticket.summary}`,
  ];
  if (ticket.persona) lines.push(`- Persona feedback for ${ticket.persona.codename}, field ${ticket.persona.field}: ${ticket.persona.why}`);
  if (ticket.decision) {
    const d = ticket.decision;
    lines.push(`- Decision ${d.id}: ${d.outcome}${d.command === undefined ? '' : `, command \`${d.command}\``}${d.why === undefined ? '' : `, owner's why: ${d.why}`}`);
  }
  for (const lesson of ticket.proposedLessons) lines.push(`- Proposed lesson ${lesson.id} (${lesson.scope}, ${lesson.world}): ${lesson.rule}`);
  return lines.join('\n');
}

function summarise(bundle: Bundle): string {
  const byReason = new Map<string, number>();
  for (const t of bundle.tickets) byReason.set(t.reason, (byReason.get(t.reason) ?? 0) + 1);
  return [
    `# Copilot audit bundle ${bundle.id}`,
    '',
    `Created ${new Date(bundle.createdAt).toISOString()}. ${bundle.ticketCount} ticket${bundle.ticketCount === 1 ? '' : 's'}${bundle.truncated ? ' (more are open: export again after these are answered)' : ''}.`,
    'Names are codenames, text is cut to short excerpts. Do not look for, guess or write a real name anywhere.',
    '',
    '## By reason',
    ...[...byReason.entries()].map(([reason, n]) => `- ${reason}: ${n}`),
    '',
    '## Tickets',
    '',
    ...bundle.tickets.map((t) => `${describe(t)}\n`),
  ].join('\n');
}

/**
 * Writes a scrubbed audit bundle (`bundles/<id>/bundle.json` and `summary.md`) for the given tickets, or for the open ones (oldest
 * first, at most BUNDLE_MAX_TICKETS). An empty queue writes nothing. Every text field is passed through `redact` and cut, so a bundle
 * holds codenames and short excerpts only; the characters are already codename references on the tickets themselves.
 */
export async function exportBundle(deps: BundleDeps, request: { ticketIds?: readonly string[] } = {}): Promise<ExportResult> {
  let selected: EscalationTicket[];
  let truncated = false;
  if (request.ticketIds === undefined) {
    const open = deps.tickets.query((t) => t.status === 'open').sort((a, b) => a.createdAt - b.createdAt);
    if (open.length === 0) return { ok: true, written: false, reason: 'no-open-tickets' };
    truncated = open.length > BUNDLE_MAX_TICKETS;
    selected = open.slice(0, BUNDLE_MAX_TICKETS);
  } else {
    const ids = [...new Set(request.ticketIds)];
    if (ids.length > BUNDLE_MAX_TICKETS) return { ok: false, error: 'too-many-tickets' };
    if (ids.length === 0) return { ok: true, written: false, reason: 'no-open-tickets' };
    selected = [];
    for (const id of ids) {
      const found = deps.tickets.get(id);
      if (found === undefined) return { ok: false, error: 'unknown-ticket' };
      selected.push(found);
    }
  }

  const redact = deps.redact;
  const tickets: BundleTicket[] = selected.map((t) => {
    const entry: BundleTicket = {
      id: t.id,
      createdAt: t.createdAt,
      character: t.character,
      reason: t.reason,
      sphere: t.sphere,
      kind: t.kind,
      situationKey: excerpt(t.situationKey, redact),
      status: t.status,
      summary: excerpt(t.summary, redact),
      proposedLessons: deps.lessons
        .query((l) => l.status === 'proposed' && l.sphere === t.sphere && l.situationKey === t.situationKey)
        .map((l) => ({ id: l.id, rule: excerpt(l.rule, redact), scope: l.scope, world: l.world })),
    };
    const persona = t.reason === 'persona-feedback' ? parsePersonaFeedbackSummary(t.summary) : null;
    if (persona) entry.persona = { codename: persona.codename, field: persona.field, why: excerpt(persona.why, redact) };
    const decision = t.decisionId === undefined ? undefined : deps.decisions.get(t.decisionId);
    if (decision) {
      entry.decision = { id: decision.id, outcome: decision.outcome };
      if (decision.command !== undefined) entry.decision.command = excerpt(decision.command, redact);
      if (decision.why !== undefined) entry.decision.why = excerpt(decision.why, redact);
    }
    return entry;
  });

  const now = deps.now();
  const id = (deps.newId ?? (() => defaultId(now)))();
  const bundle: Bundle = { version: 1, id, createdAt: now, ticketCount: tickets.length, truncated, tickets };
  const summary = summarise(bundle);
  const dir = path.join(deps.dir, id);
  try {
    if ((await deps.fs.size(path.join(dir, 'bundle.json'))) !== undefined) return { ok: false, error: 'write-failed' }; // never overwrite
    await deps.fs.append(path.join(dir, 'bundle.json'), `${JSON.stringify(bundle, null, 2)}\n`);
    await deps.fs.append(path.join(dir, 'summary.md'), summary);
  } catch {
    return { ok: false, error: 'write-failed' };
  }
  return { ok: true, written: true, id, dir, bundle, summary };
}
