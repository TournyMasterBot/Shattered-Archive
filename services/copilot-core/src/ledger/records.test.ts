import type { Decision, EscalationTicket, Finding, Lesson, ScenarioOccurrence, Suggestion } from '../contracts';
import { MAX_ARTIFACTS, MAX_ARTIFACT_PATH, MAX_COMMAND, MAX_PERSONA_WHY, MAX_WHY, PERSONA_FIELDS, buildPersonaFeedbackSummary, parsePersonaFeedbackSummary, validateDecision, validateFinding, validateLesson, validateOccurrence, validateSuggestion, validateTicket } from './records';

const decision: Decision = { id: 'd1', suggestionId: 's1', character: 'Agate-F', at: 1000, outcome: 'approved', command: 'north' };
const lesson: Lesson = {
  id: 'l1',
  createdAt: 1000,
  sphere: 'world',
  situationKey: 'hall-door',
  scope: 'shared',
  world: 'dsl',
  rule: 'Open the door before moving north.',
  sourceDecisionId: 'd1',
  status: 'proposed',
};
const ticket: EscalationTicket = {
  id: 't1',
  createdAt: 1000,
  character: 'Agate-F',
  reason: 'unknown-situation',
  sphere: 'interaction',
  kind: 'interact',
  situationKey: 'hall-door',
  summary: 'The agent did not know how to open the door.',
  status: 'open',
};
const suggestion: Suggestion = {
  id: 's1',
  character: 'Agate-F',
  createdAt: 1000,
  mode: 'exploration',
  sphere: 'world',
  kind: 'move',
  command: 'north',
  rationale: 'The map says north.',
  confidence: 0.9,
  confidenceSource: 'model',
  situationKey: 'hall-door',
};

describe('validateDecision', () => {
  it('accepts each outcome with what it needs', () => {
    expect(validateDecision(decision)).toEqual({ ok: true, value: decision });
    expect(validateDecision({ ...decision, outcome: 'corrected', command: 'open door', why: 'the door is closed' }).ok).toBe(true);
    expect(validateDecision({ ...decision, outcome: 'auto', rule: 'world:move' }).ok).toBe(true);
    expect(validateDecision({ id: 'd2', suggestionId: 's1', character: 'Agate-F', at: 5, outcome: 'rejected', why: 'wrong way' }).ok).toBe(true);
    expect(validateDecision({ id: 'd3', suggestionId: 's1', character: 'Agate-F', at: 5, outcome: 'refused', rule: 'autopilot-running' }).ok).toBe(true);
  });

  it('requires a command for approved, corrected and auto', () => {
    for (const outcome of ['approved', 'corrected', 'auto'] as const) {
      const { command: _omitted, ...rest } = decision;
      const result = validateDecision({ ...rest, outcome, rule: 'world:move' });
      expect(result).toEqual({ ok: false, errors: ['command is required'] });
    }
  });

  it('requires the rule for auto and refused, and no rule for approved is fine', () => {
    expect(validateDecision({ ...decision, outcome: 'auto' })).toEqual({ ok: false, errors: ['rule is required'] });
    expect(validateDecision({ id: 'd', suggestionId: 's', character: 'Agate-F', at: 1, outcome: 'refused' })).toEqual({
      ok: false,
      errors: ['rule is required'],
    });
  });

  it('keeps the bucket (sphere and kind) when given, and accepts an older line without it', () => {
    const bucketed = { ...decision, sphere: 'world', kind: 'move' };
    expect(validateDecision(bucketed)).toEqual({ ok: true, value: bucketed });
    expect(validateDecision(decision)).toEqual({ ok: true, value: decision }); // no sphere/kind keys appear
    expect(Object.keys((validateDecision(decision) as { value: object }).value)).not.toContain('sphere');
  });

  it('rejects a bucket that is not a sphere or an action kind, or not text', () => {
    expect(validateDecision({ ...decision, sphere: 'sky' })).toEqual({ ok: false, errors: ['sphere is not one of the allowed values'] });
    expect(validateDecision({ ...decision, kind: 'teleport' })).toEqual({ ok: false, errors: ['kind is not one of the allowed values'] });
    expect(validateDecision({ ...decision, kind: 5 }).ok).toBe(false);
    expect(validateDecision({ ...decision, sphere: null }).ok).toBe(false);
  });

  it('rejects unknown fields (E3) without echoing their value', () => {
    const result = validateDecision({ ...decision, secret: 'x'.repeat(10), extra2: 1 });
    expect(result).toEqual({ ok: false, errors: ['unknown field secret', 'unknown field extra2'] });
  });

  it('rejects a bad id (path characters), a real-name-shaped character, and wrong types', () => {
    expect(validateDecision({ ...decision, id: '../etc/passwd' }).ok).toBe(false);
    expect(validateDecision({ ...decision, id: '' }).ok).toBe(false);
    expect(validateDecision({ ...decision, suggestionId: 'a b' }).ok).toBe(false);
    expect(validateDecision({ ...decision, character: 'Zorvak' }).ok).toBe(false); // not a codename reference
    expect(validateDecision({ ...decision, character: 'Agate-X' }).ok).toBe(false);
    expect(validateDecision({ ...decision, at: -1 }).ok).toBe(false);
    expect(validateDecision({ ...decision, at: 1.5 }).ok).toBe(false);
    expect(validateDecision({ ...decision, at: '5' }).ok).toBe(false);
    expect(validateDecision({ ...decision, outcome: 'maybe' }).ok).toBe(false);
    expect(validateDecision({ ...decision, command: 5 }).ok).toBe(false);
  });

  it('caps the length of every text field (oversize input)', () => {
    expect(validateDecision({ ...decision, command: 'x'.repeat(MAX_COMMAND + 1) }).ok).toBe(false);
    expect(validateDecision({ ...decision, command: 'x'.repeat(MAX_COMMAND) }).ok).toBe(true);
    expect(validateDecision({ ...decision, why: 'x'.repeat(MAX_WHY + 1) }).ok).toBe(false);
    expect(validateDecision({ ...decision, why: '   ' }).ok).toBe(false);
  });

  it('rejects non-objects and reports every problem at once', () => {
    for (const bad of [null, undefined, 5, 'x', [], [decision]]) {
      expect(validateDecision(bad)).toEqual({ ok: false, errors: ['body must be an object'] });
    }
    const result = validateDecision({});
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.sort()).toEqual([
      'at is required',
      'character is required',
      'id is required',
      'outcome is required',
      'suggestionId is required',
    ]);
  });

  it('never echoes the value of a bad field', () => {
    const result = validateDecision({ ...decision, id: 'SECRET TEXT FROM THE GAME' });
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
});

describe('validateLesson', () => {
  it('accepts every scope with the key it needs', () => {
    expect(validateLesson(lesson)).toEqual({ ok: true, value: lesson });
    expect(validateLesson({ ...lesson, scope: 'class', scopeKey: 'Warrior' }).ok).toBe(true);
    expect(validateLesson({ ...lesson, scope: 'race', scopeKey: 'Elf' }).ok).toBe(true);
    expect(validateLesson({ ...lesson, scope: 'ability-set', scopeKey: 'bash+kick' }).ok).toBe(true);
    expect(validateLesson({ ...lesson, scope: 'character-public', world: 'sandbox' }).ok).toBe(true);
  });

  it('requires scopeKey for class, race and ability-set and forbids it elsewhere', () => {
    expect(validateLesson({ ...lesson, scope: 'class' })).toEqual({ ok: false, errors: ['scopeKey is required'] });
    expect(validateLesson({ ...lesson, scope: 'shared', scopeKey: 'Warrior' })).toEqual({
      ok: false,
      errors: ['scopeKey is only allowed for the class, race and ability-set scopes'],
    });
  });

  it('rejects an unknown world, scope, status, sphere and an empty rule', () => {
    for (const bad of [{ world: 'live' }, { scope: 'global' }, { status: 'done' }, { sphere: 'sky' }, { rule: '' }, { situationKey: '' }]) {
      expect(validateLesson({ ...lesson, ...bad }).ok).toBe(false);
    }
  });

  it('rejects unknown fields and non-objects', () => {
    expect(validateLesson({ ...lesson, extra: 1 }).ok).toBe(false);
    expect(validateLesson('x').ok).toBe(false);
  });
});

describe('validateTicket', () => {
  it('accepts a ticket with and without the optional fields', () => {
    expect(validateTicket(ticket)).toEqual({ ok: true, value: ticket });
    const full = { ...ticket, decisionId: 'd1', resolution: 'expert fixed' };
    expect(validateTicket(full)).toEqual({ ok: true, value: full });
  });

  it('accepts every reason and status, and rejects others', () => {
    for (const reason of ['low-confidence', 'correction-not-understood', 'danger', 'wrong-sphere', 'unknown-situation']) {
      expect(validateTicket({ ...ticket, reason }).ok).toBe(true);
    }
    for (const status of ['open', 'resolved', 'declined']) expect(validateTicket({ ...ticket, status }).ok).toBe(true);
    expect(validateTicket({ ...ticket, reason: 'bored' }).ok).toBe(false);
    expect(validateTicket({ ...ticket, status: 'claimed' }).ok).toBe(false);
    expect(validateTicket({ ...ticket, kind: 'teleport' }).ok).toBe(false);
  });

  it('caps the summary and resolution and rejects unknown fields', () => {
    expect(validateTicket({ ...ticket, summary: 'x'.repeat(501) }).ok).toBe(false);
    expect(validateTicket({ ...ticket, resolution: 'x'.repeat(1001) }).ok).toBe(false);
    expect(validateTicket({ ...ticket, rawLog: 'text' }).ok).toBe(false);
    expect(validateTicket(null).ok).toBe(false);
  });
});

describe('validateSuggestion', () => {
  it('accepts a suggestion with a number, a null or a zero confidence', () => {
    expect(validateSuggestion(suggestion)).toEqual({ ok: true, value: suggestion });
    expect(validateSuggestion({ ...suggestion, confidence: null }).ok).toBe(true);
    expect(validateSuggestion({ ...suggestion, confidence: 0 }).ok).toBe(true);
    expect(validateSuggestion({ ...suggestion, confidenceSource: 'map-evidence' }).ok).toBe(true);
  });

  it('rejects an out-of-range, NaN, string or missing confidence', () => {
    for (const confidence of [1.1, -0.1, NaN, Infinity, '0.9', undefined]) {
      const result = validateSuggestion({ ...suggestion, confidence });
      expect(result.ok).toBe(false);
    }
  });

  it('rejects a bad mode, sphere, kind or source, unknown fields and non-objects', () => {
    for (const bad of [{ mode: 'idle' }, { sphere: 'sky' }, { kind: 'teleport' }, { confidenceSource: 'guess' }, { rationale: '' }, { command: '' }]) {
      expect(validateSuggestion({ ...suggestion, ...bad }).ok).toBe(false);
    }
    expect(validateSuggestion({ ...suggestion, extra: 1 }).ok).toBe(false);
    expect(validateSuggestion(7).ok).toBe(false);
  });
});

describe('persona-feedback tickets', () => {
  const feedback = { codename: 'Agate-F', field: 'voice' as const, why: 'She never sounds this polite.' };
  const summary = 'Persona feedback for Agate-F; field: voice; why: She never sounds this polite.';

  it('builds the one-line summary and reads it back', () => {
    expect(buildPersonaFeedbackSummary(feedback)).toBe(summary);
    expect(parsePersonaFeedbackSummary(summary)).toEqual(feedback);
    for (const field of PERSONA_FIELDS) {
      const text = buildPersonaFeedbackSummary({ ...feedback, field }) as string;
      expect(parsePersonaFeedbackSummary(text)?.field).toBe(field);
    }
  });

  it('collapses white space in the why, and keeps a why that holds a semicolon or a colon', () => {
    expect(buildPersonaFeedbackSummary({ ...feedback, why: '  too\n\n  polite; really: far too polite ' })).toBe('Persona feedback for Agate-F; field: voice; why: too polite; really: far too polite');
    expect(parsePersonaFeedbackSummary('Persona feedback for Agate-F; field: voice; why: a; field: stance; why: b')?.why).toBe('a; field: stance; why: b');
  });

  it.each([
    ['a codename that is not a reference', { codename: 'agate', field: 'voice', why: 'x' }],
    ['a real-name-shaped codename', { codename: 'Zorvak', field: 'voice', why: 'x' }],
    ['a field that is not a persona field', { codename: 'Agate-F', field: 'mood', why: 'x' }],
    ['an empty why', { codename: 'Agate-F', field: 'voice', why: '  \n ' }],
    ['a why over the limit', { codename: 'Agate-F', field: 'voice', why: 'x'.repeat(MAX_PERSONA_WHY + 1) }],
  ])('builds nothing for %s', (_label, input) => {
    expect(buildPersonaFeedbackSummary(input as never)).toBeNull();
  });

  it('a why at the limit still fits the ticket summary cap', () => {
    const text = buildPersonaFeedbackSummary({ ...feedback, why: 'x'.repeat(MAX_PERSONA_WHY) }) as string;
    expect(text.length).toBeLessThanOrEqual(500);
  });

  it.each([
    'Persona feedback for Agate-F; field: mood; why: x',
    'Persona feedback for agate; field: voice; why: x',
    'Persona feedback for Agate-F; field: voice; why: ',
    `Persona feedback for Agate-F; field: voice; why: ${'x'.repeat(MAX_PERSONA_WHY + 1)}`,
    'The agent did not know how to open the door.',
    '',
  ])('reads nothing from %j', (text) => {
    expect(parsePersonaFeedbackSummary(text)).toBeNull();
  });

  it('a whitespace-only why is not a why', () => {
    expect(parsePersonaFeedbackSummary('Persona feedback for Agate-F; field: voice; why:    ')).toBeNull();
  });

  const ticket: EscalationTicket = {
    id: 'pf1',
    createdAt: 1000,
    character: 'Agate-F',
    reason: 'persona-feedback',
    sphere: 'interaction',
    kind: 'unknown',
    situationKey: 'persona:Agate-F',
    summary,
    status: 'open',
  };

  it('a persona-feedback ticket is valid with that summary, and only with it', () => {
    expect(validateTicket(ticket)).toEqual({ ok: true, value: ticket });
    const free = validateTicket({ ...ticket, summary: 'The agent did not know how to open the door.' });
    expect(free).toEqual({ ok: false, errors: ['summary of a persona-feedback ticket must read "Persona feedback for <codename>; field: <field>; why: <text>"'] });
    expect(validateTicket({ ...ticket, summary: 'Persona feedback for Agate-F; field: mood; why: x' }).ok).toBe(false);
  });

  it('the persona in the summary must be the ticket’s own character', () => {
    expect(validateTicket({ ...ticket, character: 'Orion-M' })).toEqual({ ok: false, errors: ["the persona in the summary must be the ticket's character"] });
  });

  it('other reasons are not held to the format, and a missing summary is the usual error', () => {
    expect(validateTicket({ ...ticket, reason: 'danger', summary: 'free text' }).ok).toBe(true);
    const { summary: _omitted, ...noSummary } = ticket;
    expect(validateTicket(noSummary)).toEqual({ ok: false, errors: ['summary is required'] });
  });
});

const finding: Finding = {
  id: 'f1',
  ticketId: 't1',
  createdAt: 2000,
  verdict: 'data-gap',
  why: 'The expert has no entry for this door.',
  artifacts: [{ path: 'tools/archive-mcp/experts/rooms.json', kind: 'expert' }],
  acceptedBy: null,
};

describe('validateFinding', () => {
  it('accepts a finding as a teaching session writes it, with every verdict and artifact kind', () => {
    expect(validateFinding(finding)).toEqual({ ok: true, value: finding });
    for (const verdict of ['local-correct', 'local-wrong', 'data-gap', 'routing-gap', 'persona']) expect(validateFinding({ ...finding, verdict }).ok).toBe(true);
    for (const kind of ['expert', 'mcp', 'sphere-link', 'skill', 'prompt', 'persona-proposal', 'map-correction', 'doc']) {
      expect(validateFinding({ ...finding, artifacts: [{ path: 'a/b.md', kind }] }).ok).toBe(true);
    }
    expect(validateFinding({ ...finding, artifacts: [] }).ok).toBe(true); // a verdict of local-correct needs no artifact
  });

  it('accepts an accepted finding with its time, and keeps acceptedAt absent otherwise', () => {
    const accepted = { ...finding, acceptedBy: 'owner' as const, acceptedAt: 3000 };
    expect(validateFinding(accepted)).toEqual({ ok: true, value: accepted });
    expect('acceptedAt' in (validateFinding(finding) as { value: object }).value).toBe(false);
  });

  it('rejects an unknown verdict, a missing why, and acceptedBy that is not null or owner', () => {
    expect(validateFinding({ ...finding, verdict: 'maybe' })).toEqual({ ok: false, errors: ['verdict is not one of the allowed values'] });
    expect(validateFinding({ ...finding, why: '' }).ok).toBe(false);
    expect(validateFinding({ ...finding, why: 'x'.repeat(1001) }).ok).toBe(false);
    const { why: _omitted, ...noWhy } = finding;
    expect(validateFinding(noWhy)).toEqual({ ok: false, errors: ['why is required'] });
    expect(validateFinding({ ...finding, acceptedBy: 'claude' })).toEqual({ ok: false, errors: ['acceptedBy must be null or owner'] });
    expect(validateFinding({ ...finding, acceptedBy: undefined }).ok).toBe(false); // explicit: null, not missing
  });

  it('needs acceptedAt exactly when the owner accepted', () => {
    expect(validateFinding({ ...finding, acceptedBy: 'owner' })).toEqual({ ok: false, errors: ['acceptedAt is required'] });
    expect(validateFinding({ ...finding, acceptedAt: 5 })).toEqual({ ok: false, errors: ['acceptedAt is only allowed for an accepted finding'] });
  });

  it('checks the artifacts: a list, at most 10, each an object with a plain path and a known kind', () => {
    expect(validateFinding({ ...finding, artifacts: 'x' })).toEqual({ ok: false, errors: ['artifacts must be a list'] });
    expect(validateFinding({ ...finding, artifacts: Array.from({ length: MAX_ARTIFACTS + 1 }, () => ({ path: 'a', kind: 'doc' })) }).ok).toBe(false);
    expect(validateFinding({ ...finding, artifacts: Array.from({ length: MAX_ARTIFACTS }, () => ({ path: 'a', kind: 'doc' })) }).ok).toBe(true);
    expect(validateFinding({ ...finding, artifacts: ['x'] })).toEqual({ ok: false, errors: ['artifacts[0] must be an object'] });
    expect(validateFinding({ ...finding, artifacts: [{ path: 'a', kind: 'nope' }] })).toEqual({ ok: false, errors: ['artifacts[0].kind is not one of the allowed values'] });
    expect(validateFinding({ ...finding, artifacts: [{ path: 'a', kind: 'doc', extra: 1 }] })).toEqual({ ok: false, errors: ['artifacts[0].unknown field extra'] });
    expect(validateFinding({ ...finding, artifacts: [{ kind: 'doc' }] })).toEqual({ ok: false, errors: ['artifacts[0].path is required'] });
    expect(validateFinding({ ...finding, artifacts: [{ path: 'x'.repeat(MAX_ARTIFACT_PATH + 1), kind: 'doc' }] }).ok).toBe(false);
  });

  it.each(['../secret', 'a/../b', 'a\\..\\b', 'https://example.com/x', 'file://c/x', 'a\nb', 'a\u0000b'])('rejects the artifact path %p', (artifactPath) => {
    const result = validateFinding({ ...finding, artifacts: [{ path: artifactPath, kind: 'doc' }] });
    expect(result.ok).toBe(false);
  });

  it('rejects unknown fields, bad ids and a body that is not an object', () => {
    expect(validateFinding({ ...finding, secret: 1 })).toEqual({ ok: false, errors: ['unknown field secret'] });
    expect(validateFinding({ ...finding, id: '../x' }).ok).toBe(false);
    expect(validateFinding({ ...finding, ticketId: 'a b' }).ok).toBe(false);
    expect(validateFinding({ ...finding, createdAt: -1 }).ok).toBe(false);
    expect(validateFinding(null)).toEqual({ ok: false, errors: ['body must be an object'] });
  });
});

describe('validateOccurrence', () => {
  const occurrence: ScenarioOccurrence = { id: 'd1', at: 5, sphere: 'world', kind: 'move', situationKey: 'exploration:hall' };

  it('accepts an occurrence and rejects every wrong field', () => {
    expect(validateOccurrence(occurrence)).toEqual({ ok: true, value: occurrence });
    expect(validateOccurrence({ ...occurrence, sphere: 'sky' }).ok).toBe(false);
    expect(validateOccurrence({ ...occurrence, kind: 'teleport' }).ok).toBe(false);
    expect(validateOccurrence({ ...occurrence, at: -1 }).ok).toBe(false);
    expect(validateOccurrence({ ...occurrence, situationKey: '' }).ok).toBe(false);
    expect(validateOccurrence({ ...occurrence, id: '../x' }).ok).toBe(false);
    expect(validateOccurrence({ ...occurrence, extra: 1 })).toEqual({ ok: false, errors: ['unknown field extra'] });
    expect(validateOccurrence([])).toEqual({ ok: false, errors: ['body must be an object'] });
  });
});
