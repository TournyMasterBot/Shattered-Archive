import { emptyMap } from '@shatteredarchive/shattered-maps-core';
import { candidatesMap } from '../testing/neutralFixtures';
import { emptyLog } from './review';
import { activeMap, initialState, neutralReducer, type NeutralAction, type NeutralState } from './store';

const META = { at: '2026-11-07', note: 'checked' };
const run = (state: NeutralState, ...actions: NeutralAction[]): NeutralState => actions.reduce(neutralReducer, state);
const withCandidates = (): NeutralState => run(initialState(), { type: 'open-candidates', map: candidatesMap(), name: 'azah.json' });

describe('opening files', () => {
  it('opens a candidates file: shown at once, on its first continent, with a notice', () => {
    const state = withCandidates();
    expect(state.view).toBe('candidates');
    expect(state.focus).toEqual({ level: 'continent', id: 'c-green' });
    expect(state.candidatesName).toBe('azah.json');
    expect(state.notice).toEqual({ tone: 'ok', text: 'Opened azah.json.' });
    expect(activeMap(state)).toBe(state.candidates);
  });

  it('keeps the import report of a DslMapper document, and drops it when a plain map file is opened next', () => {
    const report = { rooms: 1, links: 0, continents: 1, areas: 1, unassignedRooms: 0, unlistedAreaRooms: 0, danglingExits: 0, unmapped: {}, notes: [] };
    const a = run(initialState(), { type: 'open-candidates', map: candidatesMap(), name: 'old.json', report });
    expect(a.importReport).toEqual(report);
    expect(run(a, { type: 'open-candidates', map: candidatesMap(), name: 'new.json' }).importReport).toBeNull();
  });

  it('opens an audited file: replaces it, keeps the log unless one comes with it, and shows it when nothing else is open', () => {
    const map = candidatesMap();
    const state = run(initialState(), { type: 'open-audited', map });
    expect(state.audited).toBe(map);
    expect(state.view).toBe('audited');
    expect(state.focus).toEqual({ level: 'continent', id: 'c-green' });
    const log = { version: 1 as const, decisions: [{ kind: 'room' as const, id: 'x', status: 'rejected' as const, at: '2026-11-01', note: '' }] };
    expect(run(state, { type: 'open-audited', map, log }).log).toBe(log);
    expect(run(state, { type: 'open-audited', map }).log).toBe(state.log);
  });

  it('opening the audited file while the candidates are shown leaves the candidates in view', () => {
    const state = run(withCandidates(), { type: 'focus', focus: { level: 'area', id: 'a-farm' } }, { type: 'open-audited', map: emptyMap() });
    expect(state.view).toBe('candidates');
    expect(state.focus).toEqual({ level: 'area', id: 'a-farm' });
  });

  it('empties the audited file and the log, and clears the view when it was the audited one', () => {
    const accepted = run(withCandidates(), { type: 'accept-room', id: 'r-gate', meta: META }, { type: 'view', view: 'audited' });
    expect(accepted.audited.continents).toHaveLength(1);
    const reset = run(accepted, { type: 'reset-audited' });
    expect(reset.audited.continents).toEqual([]);
    expect(reset.log.decisions).toEqual([]);
    expect(reset.focus).toBeNull();
    expect(reset.view).toBe('audited');
    // with the candidates on screen, the view stays where it was
    const reviewing = run(withCandidates(), { type: 'accept-room', id: 'r-gate', meta: META }, { type: 'reset-audited' });
    expect(reviewing.view).toBe('candidates');
    expect(reviewing.focus).toEqual({ level: 'continent', id: 'c-green' });
  });
});

describe('looking around', () => {
  it('switches view, keeping the focus when the other map has it and resetting it when not', () => {
    const accepted = run(withCandidates(), { type: 'accept-room', id: 'r-gate', meta: META }, { type: 'focus', focus: { level: 'area', id: 'a-farm' } });
    expect(run(accepted, { type: 'view', view: 'audited' }).focus).toEqual({ level: 'area', id: 'a-farm' });
    const harbor = run(accepted, { type: 'focus', focus: { level: 'area', id: 'a-harbor' } }, { type: 'view', view: 'audited' });
    expect(harbor.focus).toEqual({ level: 'continent', id: 'c-green' });
  });

  it('refuses the candidates view when none is open', () => {
    const state = run(initialState(), { type: 'view', view: 'candidates' });
    expect(state.view).toBe('audited');
    expect(state.notice).toEqual({ tone: 'error', text: 'Open a candidates file first.' });
  });

  it('zooming selects the room when the focus is a room, and clears the floor and the selection otherwise', () => {
    const base = run(withCandidates(), { type: 'floor', floor: 1 }, { type: 'select', selected: { kind: 'link', id: 'l1' } });
    expect(run(base, { type: 'focus', focus: { level: 'room', id: 'r-gate' } })).toMatchObject({ floor: null, selected: { kind: 'room', id: 'r-gate' } });
    expect(run(base, { type: 'focus', focus: { level: 'area', id: 'a-farm' } })).toMatchObject({ floor: null, selected: null });
    expect(run(base, { type: 'floor', floor: null }).floor).toBeNull();
  });

  it('shows a notice and takes it away', () => {
    const shown = run(initialState(), { type: 'notice', notice: { tone: 'error', text: 'x' } });
    expect(shown.notice).toEqual({ tone: 'error', text: 'x' });
    expect(run(shown, { type: 'notice', notice: null }).notice).toBeNull();
  });
});

describe('reviewing', () => {
  it('accepts a room and a link into the audited file, and says so', () => {
    const a = run(withCandidates(), { type: 'accept-room', id: 'r-gate', meta: META });
    expect(a.audited.continents[0].areas[0].subzones[0].rooms.map((r) => r.id)).toEqual(['r-gate']);
    expect(a.notice).toEqual({ tone: 'ok', text: 'Room accepted.' });
    const b = run(a, { type: 'accept-link', id: 'l1', meta: META });
    expect(b.audited.links.map((l) => l.id)).toEqual(['l1']);
    expect(b.notice).toEqual({ tone: 'ok', text: 'Link accepted.' });
  });

  it('turns a refused accept into an error notice and changes nothing else', () => {
    const a = run(withCandidates(), { type: 'accept-room', id: 'r-gate', meta: META });
    const again = run(a, { type: 'accept-room', id: 'r-gate', meta: META });
    expect(again.notice).toEqual({ tone: 'error', text: 'the room is already in the audited file' });
    expect(again.audited).toBe(a.audited);
    expect(again.log).toBe(a.log);
  });

  it('says to open candidates when asked to review with none open', () => {
    for (const action of [
      { type: 'accept-room', id: 'r-gate', meta: META },
      { type: 'accept-link', id: 'l1', meta: META },
      { type: 'accept-many', items: [], meta: META },
    ] as NeutralAction[])
      expect(run(initialState(), action).notice).toEqual({ tone: 'error', text: 'Open a candidates file first.' });
  });

  it('accepts many at once and reports what it skipped', () => {
    const items = [
      { kind: 'room' as const, id: 'r-gate' },
      { kind: 'room' as const, id: 'r-barn' },
      { kind: 'room' as const, id: 'nope' },
    ];
    const state = run(withCandidates(), { type: 'accept-many', items, meta: META });
    expect(state.notice).toEqual({ tone: 'ok', text: 'Accepted 2 of 3. 1 skipped: the room is not a live room of the candidates file.' });
    const none = run(withCandidates(), { type: 'accept-many', items: [{ kind: 'room', id: 'nope' }], meta: META });
    expect(none.notice?.tone).toBe('error');
    expect(run(withCandidates(), { type: 'accept-many', items: [{ kind: 'room', id: 'r-gate' }], meta: META }).notice).toEqual({ tone: 'ok', text: 'Accepted 1 of 1.' });
  });

  it('rejects and reopens, with errors for what cannot be', () => {
    const rejected = run(withCandidates(), { type: 'reject', kind: 'room', id: 'r-well', meta: META });
    expect(rejected.log.decisions.map((d) => [d.id, d.status])).toEqual([['r-well', 'rejected']]);
    expect(rejected.notice).toEqual({ tone: 'ok', text: 'Room rejected.' });
    expect(run(rejected, { type: 'reject', kind: 'link', id: 'l1', meta: META }).notice?.text).toBe('Link rejected.');
    expect(run(rejected, { type: 'reject', kind: 'room', id: 'r-well', meta: META }).notice).toEqual({ tone: 'error', text: 'the room is already rejected' });
    const back = run(rejected, { type: 'reopen', kind: 'room', id: 'r-well' });
    expect(back.log.decisions).toEqual([]);
    expect(back.notice).toEqual({ tone: 'ok', text: 'Back in the queue.' });
    expect(run(back, { type: 'reopen', kind: 'room', id: 'r-well' }).notice).toEqual({ tone: 'error', text: 'the room is not rejected' });
  });

  it('edits an audited room and link, and reports a refused edit', () => {
    const accepted = run(withCandidates(), { type: 'accept-link', id: 'l3', meta: META });
    const edited = run(accepted, { type: 'edit-room', id: 'r-gate', edits: { title: 'Great Gate' }, meta: META }, { type: 'edit-link', id: 'l3', edits: { to: 'r-barn' }, meta: META });
    expect(edited.audited.continents[0].areas[0].subzones[0].rooms[0].title).toBe('Great Gate');
    expect(edited.audited.links[0]).toMatchObject({ to: 'r-barn', state: 'candidate' });
    expect(edited.notice).toEqual({ tone: 'ok', text: 'Link changed.' });
    expect(run(edited, { type: 'edit-room', id: 'r-barn', edits: { title: 'x' }, meta: META }).notice).toEqual({ tone: 'error', text: 'the room is not in the audited file' });
    // a link edit works without candidates open too (the target must then be in the audited file)
    const alone = run(initialState(emptyMap(), emptyLog()), { type: 'edit-link', id: 'zz', edits: { to: null }, meta: META });
    expect(alone.notice).toEqual({ tone: 'error', text: 'the link is not in the audited file' });
  });
});
