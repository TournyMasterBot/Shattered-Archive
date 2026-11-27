import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { BucketTable, Decision, EscalationTicket, Suggestion } from '@shatteredarchive/copilot-core';
import type { ApiResult, CopilotApi, ServerState } from '../features/copilot/api';
import type { CommandGate, GateResult } from '../features/copilot/gate';
import { createFocusStore, type Focus } from '../features/copilot/focus';
import { createSettingsStore } from '../features/copilot/settings';
import CopilotReview from './CopilotReview';

const make = (id: string, command: string, extra: Partial<Suggestion> = {}): Suggestion => ({
  id,
  character: 'Agate-F',
  createdAt: Number(id.replace(/\D/g, '')) || 1,
  mode: 'exploration',
  sphere: 'world',
  kind: 'move',
  command,
  rationale: `Because of ${command}.`,
  confidence: 0.82,
  confidenceSource: 'model',
  situationKey: 'exploration:hall',
  ...extra,
});

interface Harness {
  server: Suggestion[];
  online: boolean;
  postOk: boolean;
  gateResult: GateResult;
  sent: string[];
  posted: Decision[];
  tickets: number;
  /** Tickets the window filed by itself (a policy escalation). */
  filed: EscalationTicket[];
  /** The owner's history per bucket, as the server counts it. */
  buckets: BucketTable;
  /** Rules switched on in the settings, keyed `<sphere>:<kind>`; none by default. */
  rules: Record<string, { enabled: boolean; threshold: number }>;
  /** What Copilot is for: the AI agent unless a test says Training. */
  focus: Focus;
}

const FRESH_STATE: ServerState = { connected: true, stale: false, staleAfterSeconds: 60, lastEventAgeSeconds: 1, lastTextAgeSeconds: 2, inFight: false, room: null };

function setup(over: Partial<Harness> = {}) {
  const h: Harness = { server: [make('s1', 'north'), make('s2', 'look')], online: true, postOk: true, gateResult: { ok: true }, sent: [], posted: [], tickets: 0, filed: [], buckets: {}, rules: {}, focus: 'agent', ...over };
  const api = {
    getSuggestions: async (): Promise<ApiResult<Suggestion[]>> => (h.online ? { ok: true, value: [...h.server] } : { ok: false, reason: 'offline' }),
    getOpenTickets: async (): Promise<ApiResult<EscalationTicket[]>> => (h.online ? { ok: true, value: Array.from({ length: h.tickets }, (_, i) => ({ id: `t${i}` }) as EscalationTicket) } : { ok: false, reason: 'offline' }),
    getState: async (): Promise<ApiResult<ServerState>> => ({ ok: true, value: FRESH_STATE }),
    getBucketStats: async (): Promise<ApiResult<BucketTable>> => ({ ok: true, value: h.buckets }),
    postTicket: async (t: EscalationTicket): Promise<ApiResult<{ written: boolean }>> => (h.filed.push(t), { ok: true, value: { written: true } }),
    postDecision: async (d: Decision): Promise<ApiResult<{ written: boolean }>> => {
      if (!h.postOk) return { ok: false, reason: 'offline' };
      h.posted.push(d);
      if (d.outcome !== 'refused') h.server = h.server.filter((s) => s.id !== d.suggestionId); // the server keeps a refused one current
      return { ok: true, value: { written: true } };
    },
  } as unknown as CopilotApi;
  const gate = {
    send: (c: string) => {
      if (h.gateResult.ok) h.sent.push(c);
      return h.gateResult;
    },
  } as unknown as CommandGate;
  const settings = createSettingsStore(undefined);
  settings.set({ rules: h.rules });
  const focus = createFocusStore(undefined);
  focus.set(h.focus);
  const view = render(<CopilotReview api={api} gate={gate} settings={settings} focus={focus} intervalMs={20} />);
  return Object.assign(h, { unmount: view.unmount, focusStore: focus });
}

const card = (command: string) => screen.getByRole('listitem', { name: `Suggestion ${command}` });
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 5))));

describe('CopilotReview', () => {
  it('shows each suggestion with sphere, kind, command, rationale and the confidence with its source', async () => {
    setup({ tickets: 3, server: [make('s1', 'north'), make('s2', 'look', { confidence: null }), make('s3', 'n', { confidence: 0.5, confidenceSource: 'map-evidence' })] });
    await screen.findByLabelText('Suggestion north');
    const north = within(card('north'));
    expect(north.getByText('world')).toBeInTheDocument();
    expect(north.getByText('move')).toBeInTheDocument();
    expect(north.getByText('Because of north.')).toBeInTheDocument();
    expect(north.getByText('Confidence 82% (model)')).toBeInTheDocument();
    expect(within(card('look')).getByText('Confidence not rated')).toBeInTheDocument();
    expect(within(card('n')).getByText('Confidence 50% (map evidence)')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Open tickets: 3')).toBeInTheDocument());
  });

  it('shows an empty state when there is nothing to answer', async () => {
    setup({ server: [] });
    expect(await screen.findByText('No suggestions yet.')).toBeInTheDocument();
    expect(screen.getByText('Nothing answered yet.')).toBeInTheDocument();
  });

  it('Approve sends the command through the gate once, records approved, removes the card and logs it', async () => {
    const h = setup();
    await screen.findByLabelText('Suggestion north');
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.queryByLabelText('Suggestion north')).toBeNull());
    expect(h.sent).toEqual(['north']);
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]).toMatchObject({ suggestionId: 's1', outcome: 'approved', command: 'north' });
    expect(within(screen.getByLabelText('Session log')).getByText(/Approved north/)).toBeInTheDocument();
    expect(screen.getByLabelText('Suggestion look')).toBeInTheDocument();
  });

  it('Correct is disabled without a why, and with one sends and records the corrected command with the why', async () => {
    const h = setup();
    await screen.findByLabelText('Suggestion north');
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Correct' }));
    const send = within(card('north')).getByRole('button', { name: 'Send correction' });
    expect(send).toBeDisabled();
    expect(within(card('north')).getByText('0/280')).toBeInTheDocument();
    fireEvent.change(within(card('north')).getByLabelText('Command to send instead'), { target: { value: 'open door' } });
    fireEvent.change(within(card('north')).getByLabelText('Why (required)'), { target: { value: 'ab' } });
    expect(send).toBeDisabled();
    expect(within(card('north')).getByText(/at least 3 characters/)).toBeInTheDocument();
    fireEvent.change(within(card('north')).getByLabelText('Why (required)'), { target: { value: 'It is a door, not an exit.' } });
    expect(within(card('north')).getByText(/^26\/280/)).toBeInTheDocument();
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() => expect(screen.queryByLabelText('Suggestion north')).toBeNull());
    expect(h.sent).toEqual(['open door']);
    expect(h.posted[0]).toMatchObject({ outcome: 'corrected', command: 'open door', why: 'It is a door, not an exit.' });
  });

  it('a correction with an emptied command cannot be sent', async () => {
    setup();
    await screen.findByLabelText('Suggestion north');
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Correct' }));
    fireEvent.change(within(card('north')).getByLabelText('Command to send instead'), { target: { value: '   ' } });
    fireEvent.change(within(card('north')).getByLabelText('Why (required)'), { target: { value: 'Needs a command.' } });
    expect(within(card('north')).getByRole('button', { name: 'Send correction' })).toBeDisabled();
  });

  it('the counter turns to the over-limit state past 280 characters and blocks sending', async () => {
    setup();
    await screen.findByLabelText('Suggestion north');
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Correct' }));
    fireEvent.change(within(card('north')).getByLabelText('Why (required)'), { target: { value: 'x'.repeat(281) } });
    expect(within(card('north')).getByText(/^281\/280/)).toHaveAttribute('data-over', 'true');
    expect(within(card('north')).getByRole('button', { name: 'Send correction' })).toBeDisabled();
  });

  it('Reject records rejected with no command and sends nothing; the why is optional', async () => {
    const h = setup();
    await screen.findByLabelText('Suggestion north');
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Reject' }));
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Reject' })); // the confirm button, no why given
    await waitFor(() => expect(screen.queryByLabelText('Suggestion north')).toBeNull());
    expect(h.sent).toEqual([]);
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]).toMatchObject({ outcome: 'rejected' });
    expect('command' in h.posted[0]).toBe(false);
    expect('why' in h.posted[0]).toBe(false);
  });

  it('Reject carries the why when one is typed', async () => {
    const h = setup();
    await screen.findByLabelText('Suggestion north');
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Reject' }));
    fireEvent.change(within(card('north')).getByLabelText('Why (optional)'), { target: { value: 'Too risky.' } });
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(h.posted).toHaveLength(1));
    expect(h.posted[0]).toMatchObject({ outcome: 'rejected', why: 'Too risky.' });
  });

  it('Cancel closes the form and forgets what was typed', async () => {
    setup();
    await screen.findByLabelText('Suggestion north');
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Correct' }));
    fireEvent.change(within(card('north')).getByLabelText('Why (required)'), { target: { value: 'typed' } });
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Cancel' }));
    expect(within(card('north')).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Correct' }));
    expect(within(card('north')).getByLabelText('Why (required)')).toHaveValue('');
  });

  it('a refused gate shows the reason, keeps the card, records nothing, and a second approval can still go through', async () => {
    const h = setup({ gateResult: { ok: false, reason: 'autopilot-running' } });
    await screen.findByLabelText('Suggestion north');
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Approve' }));
    expect(await within(card('north')).findByText(/Autopilot is running/)).toBeInTheDocument();
    expect(h.sent).toEqual([]);
    expect(h.posted).toEqual([]);
    expect(within(screen.getByLabelText('Session log')).getByText(/not sent \(autopilot-running\)/)).toBeInTheDocument();
    h.gateResult = { ok: true };
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(h.posted).toHaveLength(1));
    expect(h.sent).toEqual(['north']);
  });

  it('while the server is unreachable the last list stays, is marked, and cannot be answered', async () => {
    const h = setup();
    await screen.findByLabelText('Suggestion north');
    h.online = false;
    expect(await screen.findByRole('alert')).toHaveTextContent(/last list/);
    expect(within(card('north')).getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(within(card('north')).getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(screen.getByText('Open tickets: unknown')).toBeInTheDocument();
    h.online = true;
    await waitFor(() => expect(within(card('north')).getByRole('button', { name: 'Approve' })).toBeEnabled());
  });

  it('pressing Enter in a form that is not valid yet (no why) sends and records nothing', async () => {
    const h = setup();
    await screen.findByLabelText('Suggestion north');
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Correct' }));
    fireEvent.submit(card('north').querySelector('form') as HTMLFormElement);
    await settle();
    expect(h.sent).toEqual([]);
    expect(h.posted).toEqual([]);
  });

  it('an answer that finishes after its card is gone (the server retired it meanwhile) still lands in the log', async () => {
    let release: () => void = () => undefined;
    const h: Harness = { server: [make('s1', 'north')], online: true, postOk: true, gateResult: { ok: true }, sent: [], posted: [], tickets: 0, filed: [], buckets: {}, rules: {}, focus: 'agent' };
    const api = {
      getSuggestions: async (): Promise<ApiResult<Suggestion[]>> => ({ ok: true, value: [...h.server] }),
      getOpenTickets: async (): Promise<ApiResult<EscalationTicket[]>> => ({ ok: true, value: [] }),
      getState: async (): Promise<ApiResult<ServerState>> => ({ ok: true, value: FRESH_STATE }),
      getBucketStats: async (): Promise<ApiResult<BucketTable>> => ({ ok: true, value: {} }),
      postDecision: (d: Decision) => new Promise<ApiResult<{ written: boolean }>>((resolve) => (release = () => (h.posted.push(d), resolve({ ok: true, value: { written: true } })))),
    } as unknown as CopilotApi;
    const gate = { send: (c: string) => (h.sent.push(c), { ok: true as const }) } as unknown as CommandGate;
    render(<CopilotReview api={api} gate={gate} settings={createSettingsStore(undefined)} focus={createFocusStore(undefined)} intervalMs={20} />);
    await screen.findByLabelText('Suggestion north');
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Approve' }));
    h.server = []; // retired on the server while the answer is on its way
    await waitFor(() => expect(screen.queryByLabelText('Suggestion north')).toBeNull());
    await act(async () => release());
    await waitFor(() => expect(within(screen.getByLabelText('Session log')).getByText(/Approved north/)).toBeInTheDocument());
  });

  it('a command that was sent but could not be recorded is logged as such and the card is removed', async () => {
    const h = setup({ postOk: false });
    await screen.findByLabelText('Suggestion north');
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.queryByLabelText('Suggestion north')).toBeNull());
    expect(h.sent).toEqual(['north']);
    expect(within(screen.getByLabelText('Session log')).getByText(/not recorded: server unreachable/)).toBeInTheDocument();
  });

  it('a rejection that could not be recorded keeps the card and says so', async () => {
    setup({ postOk: false });
    await screen.findByLabelText('Suggestion north');
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Reject' }));
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Reject' }));
    expect(await within(card('north')).findByText(/rejection was not recorded/)).toBeInTheDocument();
  });

  it('keeps only the last 50 answers in the session log', async () => {
    const many = Array.from({ length: 52 }, (_, i) => make(`s${i + 1}`, `cmd${i + 1}`));
    setup({ server: many });
    await screen.findByLabelText('Suggestion cmd1');
    for (let i = 1; i <= 52; i += 1) {
      fireEvent.click(within(card(`cmd${i}`)).getByRole('button', { name: 'Approve' }));
      await waitFor(() => expect(screen.queryByLabelText(`Suggestion cmd${i}`)).toBeNull());
    }
    expect(screen.getByText('Session log (50)')).toBeInTheDocument();
    await settle();
  });

  it('the details of the situation are available but folded away', async () => {
    setup();
    await screen.findByLabelText('Suggestion north');
    const details = within(card('north')).getByText('Situation').closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText('exploration:hall')).toBeInTheDocument();
  });
});

describe('CopilotReview: auto-approval', () => {
  const rule = { 'world:move': { enabled: true, threshold: 0.8 } };
  const earned = (total: number): BucketTable => ({ 'world:move': { approved: total, total } });

  it('sends nothing by itself while every rule is off: the owner still has to answer', async () => {
    const h = setup({ buckets: earned(50) });
    await screen.findByLabelText('Suggestion north');
    await settle();
    expect(h.sent).toEqual([]);
    expect(h.posted).toEqual([]);
    expect(screen.getByLabelText('Suggestion north')).toBeInTheDocument();
  });

  it('runs a suggestion an enabled rule allows: sent through the gate once, recorded as auto, card removed, logged with the rule', async () => {
    const h = setup({ rules: rule, buckets: earned(20), server: [make('s1', 'north', { confidence: 0.95 })] });
    await waitFor(() => expect(screen.queryByLabelText('Suggestion north')).toBeNull());
    await settle();
    expect(h.sent).toEqual(['north']);
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]).toMatchObject({ suggestionId: 's1', outcome: 'auto', command: 'north', rule: 'world:move', sphere: 'world', kind: 'move' });
    expect(within(screen.getByLabelText('Session log')).getByText(/Auto \(world:move\) north/)).toBeInTheDocument();
  });

  it('in Training the same rule runs nothing: the card waits for the owner, and nothing is sent or recorded', async () => {
    const h = setup({ focus: 'training', rules: rule, buckets: earned(50), server: [make('s1', 'north', { confidence: 0.99 })] });
    await screen.findByLabelText('Suggestion north');
    await settle();
    expect(h.sent).toEqual([]);
    expect(h.posted).toEqual([]);
    expect(screen.getByLabelText('Suggestion north')).toBeInTheDocument();
    // and the owner's own answer still works: that is what Training is for
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(h.sent).toEqual(['north']));
    expect(h.posted[0]).toMatchObject({ suggestionId: 's1', outcome: 'approved', command: 'north' });
  });

  it('a suggestion that arrives after the owner switches to the AI agent is run by its rule, and one that arrived in Training was not', async () => {
    const h = setup({ focus: 'training', rules: rule, buckets: earned(50), server: [make('s1', 'north', { confidence: 0.99 })] });
    await screen.findByLabelText('Suggestion north');
    await settle();
    expect(h.sent).toEqual([]);
    act(() => h.focusStore.set('agent'));
    h.server = [make('s2', 'look', { kind: 'move', confidence: 0.99 })]; // the next suggestion
    await waitFor(() => expect(h.sent).toEqual(['look']));
    expect(h.posted.map((d) => d.outcome)).toEqual(['auto']);
  });

  it('asks, with the card left in place, when the owner has answered only 19 like it', async () => {
    const h = setup({ rules: rule, buckets: earned(19), server: [make('s1', 'north', { confidence: 0.95 })] });
    await screen.findByLabelText('Suggestion north');
    await settle();
    expect(h.sent).toEqual([]);
    expect(screen.getByLabelText('Suggestion north')).toBeInTheDocument();
  });

  it('a gate that refuses leaves the card for the owner, records refused, and is not retried while the card stays', async () => {
    const h = setup({ rules: rule, buckets: earned(20), server: [make('s1', 'north', { confidence: 0.95 })], gateResult: { ok: false, reason: 'user-typing' } });
    await waitFor(() => expect(within(screen.getByLabelText('Session log')).getByText(/not sent \(user-typing\); waiting for you/)).toBeInTheDocument());
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 120)))); // several polls pass
    expect(screen.getByLabelText('Suggestion north')).toBeInTheDocument();
    expect(h.posted.map((d) => d.outcome)).toEqual(['refused']);
    expect(h.posted[0]).toMatchObject({ rule: 'user-typing' });
    expect(screen.getByText('Session log (1)')).toBeInTheDocument();

    // the owner can still approve it by hand once the gate lets it through
    h.gateResult = { ok: true };
    fireEvent.click(within(card('north')).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.queryByLabelText('Suggestion north')).toBeNull());
    expect(h.sent).toEqual(['north']);
    expect(h.posted.map((d) => d.outcome)).toEqual(['refused', 'approved']);
  });

  it('files a ticket, and sends nothing, for a command the policy cannot place', async () => {
    const h = setup({ rules: rule, buckets: earned(50), server: [make('s1', 'group all', { kind: 'unknown' })] });
    await waitFor(() => expect(h.filed).toHaveLength(1));
    await settle();
    expect(h.filed[0]).toMatchObject({ id: 't-s1', reason: 'unknown-situation', kind: 'unknown' });
    expect(h.sent).toEqual([]);
    expect(screen.getByLabelText('Suggestion group all')).toBeInTheDocument();
  });

  it('closing the list stops it: a suggestion that arrives afterwards runs nothing', async () => {
    const h = setup({ rules: rule, buckets: earned(20), server: [] });
    await screen.findByText('No suggestions yet.');
    h.unmount();
    h.server = [make('s1', 'north', { confidence: 0.95 })];
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 80))));
    expect(h.sent).toEqual([]);
    expect(h.posted).toEqual([]);
  });
});
