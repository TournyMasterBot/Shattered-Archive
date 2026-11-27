import path from 'node:path';
import type { Decision, EscalationTicket, Finding, JsonlStore, LedgerFs, Lesson, ScenarioOccurrence, Suggestion } from '@shatteredarchive/copilot-core';
import { exportBundle, type ExportResult } from './bundle.js';
import { acceptTicket, importFinding, type AcceptResult, type ImportResult } from './findings.js';
import { computeTrainingMetrics, type TrainingMetrics } from './metrics.js';

export interface TeacherDeps {
  fs: LedgerFs;
  dataDir: string;
  tickets: JsonlStore<EscalationTicket>;
  decisions: JsonlStore<Decision>;
  lessons: JsonlStore<Lesson>;
  findings: JsonlStore<Finding>;
  occurrences: JsonlStore<ScenarioOccurrence>;
  redact: (text: string) => string;
  now?: () => number;
  newBundleId?: () => string;
}

/** What the HTTP layer needs of the teaching side. */
export interface TeacherApi {
  exportBundle(ticketIds?: readonly string[]): Promise<ExportResult>;
  importFinding(input: unknown): Promise<ImportResult>;
  acceptTicket(ticketId: string): Promise<AcceptResult>;
  listFindings(limit: number): Finding[];
  metrics(): TrainingMetrics;
  /** Note that the owner took the agent's suggestion (approved, or a rule ran it): the agent handled that situation without a ticket. */
  recordOccurrence(decision: Decision, suggestion: Suggestion | undefined): Promise<boolean>;
}

/**
 * The teaching side of Copilot: audit bundles for a Claude Code session, the findings it writes, the owner's acceptance, and the
 * counts that show whether the agent needs Claude less over time. All of it is local files and the ledger; nothing here calls a model.
 */
export function createTeacher(deps: TeacherDeps): TeacherApi {
  const now = deps.now ?? Date.now;
  const findingDeps = { findings: deps.findings, tickets: deps.tickets, lessons: deps.lessons, redact: deps.redact, now };

  return {
    exportBundle: (ticketIds) =>
      exportBundle(
        {
          fs: deps.fs,
          dir: path.join(deps.dataDir, 'bundles'),
          tickets: deps.tickets,
          decisions: deps.decisions,
          lessons: deps.lessons,
          redact: deps.redact,
          now,
          newId: deps.newBundleId,
        },
        ticketIds === undefined ? {} : { ticketIds },
      ),
    importFinding: (input) => importFinding(findingDeps, input),
    acceptTicket: (ticketId) => acceptTicket(findingDeps, ticketId),
    listFindings: (limit) => deps.findings.query().sort((a, b) => b.createdAt - a.createdAt).slice(0, limit),
    metrics() {
      const m = computeTrainingMetrics({ tickets: deps.tickets.query(), findings: deps.findings.query(), occurrences: deps.occurrences.query() }, now());
      // the situation keys can carry a room title: names go through the same replacement as everything else that leaves the ledger
      return { ...m, scenarios: m.scenarios.map((s) => ({ ...s, situationKey: deps.redact(s.situationKey) })) };
    },
    async recordOccurrence(decision, suggestion) {
      if ((decision.outcome !== 'approved' && decision.outcome !== 'auto') || suggestion === undefined) return false;
      const saved = await deps.occurrences.append({
        id: decision.id,
        at: decision.at,
        sphere: suggestion.sphere,
        kind: suggestion.kind,
        situationKey: suggestion.situationKey,
      });
      return saved.ok && saved.written;
    },
  };
}
