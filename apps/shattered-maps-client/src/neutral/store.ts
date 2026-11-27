import { emptyMap, type MapFile } from '@shatteredarchive/shattered-maps-core';
import type { AdapterReport } from './adapter';
import {
  acceptLink,
  acceptMany,
  acceptRoom,
  editLink,
  editRoom,
  emptyLog,
  rejectItem,
  reopenItem,
  type ItemKind,
  type LinkEdits,
  type Meta,
  type Outcome,
  type ReviewLog,
  type RoomEdits,
} from './review';
import { breadcrumb, defaultFocus, type Focus } from './zoom';

/**
 * The neutral viewer's state: the audited file (what the curator keeps), the candidates file (what is being reviewed), the review log,
 * and where the viewer is looking. A pure reducer; the provider in state.tsx adds persistence of the audited file and the log.
 */

export type ViewName = 'audited' | 'candidates';

export interface Selection {
  kind: ItemKind;
  id: string;
}

export interface NoticeState {
  tone: 'ok' | 'error';
  text: string;
}

export interface NeutralState {
  audited: MapFile;
  log: ReviewLog;
  candidates: MapFile | null;
  candidatesName: string | null;
  /** What the last import of a DslMapper document left behind (null for a map file). */
  importReport: AdapterReport | null;
  view: ViewName;
  focus: Focus | null;
  /** `null`: the floor with the most rooms. */
  floor: number | null;
  selected: Selection | null;
  notice: NoticeState | null;
}

export type NeutralAction =
  | { type: 'open-candidates'; map: MapFile; name: string; report?: AdapterReport }
  | { type: 'open-audited'; map: MapFile; log?: ReviewLog }
  | { type: 'reset-audited' }
  | { type: 'view'; view: ViewName }
  | { type: 'focus'; focus: Focus }
  | { type: 'floor'; floor: number | null }
  | { type: 'select'; selected: Selection | null }
  | { type: 'accept-room'; id: string; meta: Meta; edits?: RoomEdits }
  | { type: 'accept-link'; id: string; meta: Meta; edits?: LinkEdits }
  | { type: 'accept-many'; items: { kind: ItemKind; id: string }[]; meta: Meta }
  | { type: 'reject'; kind: ItemKind; id: string; meta: Meta }
  | { type: 'reopen'; kind: ItemKind; id: string }
  | { type: 'edit-room'; id: string; edits: RoomEdits; meta: Meta }
  | { type: 'edit-link'; id: string; edits: LinkEdits; meta: Meta }
  | { type: 'notice'; notice: NoticeState | null };

export function initialState(audited: MapFile = emptyMap(), log: ReviewLog = emptyLog()): NeutralState {
  return {
    audited,
    log,
    candidates: null,
    candidatesName: null,
    importReport: null,
    view: 'audited',
    focus: defaultFocus(audited),
    floor: null,
    selected: null,
    notice: null,
  };
}

/** The map the viewer is showing. */
export function activeMap(state: NeutralState): MapFile {
  return state.view === 'candidates' && state.candidates ? state.candidates : state.audited;
}

const ok = (text: string): NoticeState => ({ tone: 'ok', text });
const bad = (text: string): NoticeState => ({ tone: 'error', text });

function applied(state: NeutralState, outcome: Outcome, text: string): NeutralState {
  return outcome.ok ? { ...state, audited: outcome.audited, log: outcome.log, notice: ok(text) } : { ...state, notice: bad(outcome.reason) };
}

export function neutralReducer(state: NeutralState, action: NeutralAction): NeutralState {
  switch (action.type) {
    case 'open-candidates':
      return {
        ...state,
        candidates: action.map,
        candidatesName: action.name,
        importReport: action.report ?? null,
        view: 'candidates',
        focus: defaultFocus(action.map),
        floor: null,
        selected: null,
        notice: ok(`Opened ${action.name}.`),
      };
    case 'open-audited': {
      const showingAudited = state.view === 'audited' || !state.candidates;
      return {
        ...state,
        audited: action.map,
        log: action.log ?? state.log,
        view: showingAudited ? 'audited' : state.view,
        focus: showingAudited ? defaultFocus(action.map) : state.focus,
        floor: null,
        selected: null,
        notice: ok('Opened the audited file.'),
      };
    }
    case 'reset-audited': {
      const showingAudited = state.view === 'audited' || !state.candidates;
      return {
        ...state,
        audited: emptyMap(),
        log: emptyLog(),
        view: showingAudited ? 'audited' : state.view,
        focus: showingAudited ? null : state.focus,
        selected: null,
        notice: ok('The audited file and the review log are empty again.'),
      };
    }
    case 'view': {
      if (action.view === 'candidates' && !state.candidates) return { ...state, notice: bad('Open a candidates file first.') };
      const map = action.view === 'candidates' ? (state.candidates as MapFile) : state.audited;
      const keep = state.focus !== null && breadcrumb(map, state.focus).length > 0;
      return { ...state, view: action.view, focus: keep ? state.focus : defaultFocus(map), floor: null, selected: null };
    }
    case 'focus':
      return { ...state, focus: action.focus, floor: null, selected: action.focus.level === 'room' ? { kind: 'room', id: action.focus.id } : null };
    case 'floor':
      return { ...state, floor: action.floor };
    case 'select':
      return { ...state, selected: action.selected };
    case 'accept-room':
      return state.candidates
        ? applied(state, acceptRoom(state.candidates, state.audited, state.log, action.id, action.meta, action.edits), 'Room accepted.')
        : { ...state, notice: bad('Open a candidates file first.') };
    case 'accept-link':
      return state.candidates
        ? applied(state, acceptLink(state.candidates, state.audited, state.log, action.id, action.meta, action.edits), 'Link accepted.')
        : { ...state, notice: bad('Open a candidates file first.') };
    case 'accept-many': {
      if (!state.candidates) return { ...state, notice: bad('Open a candidates file first.') };
      const out = acceptMany(state.candidates, state.audited, state.log, action.items, action.meta);
      const text = `Accepted ${out.accepted} of ${action.items.length}.${out.skipped.length > 0 ? ` ${out.skipped.length} skipped: ${out.skipped[0].reason}.` : ''}`;
      return { ...state, audited: out.audited, log: out.log, notice: out.skipped.length > 0 && out.accepted === 0 ? bad(text) : ok(text) };
    }
    case 'reject': {
      const out = rejectItem(state.log, action.kind, action.id, action.meta);
      return out.ok ? { ...state, log: out.log, notice: ok(`${action.kind === 'room' ? 'Room' : 'Link'} rejected.`) } : { ...state, notice: bad(out.reason) };
    }
    case 'reopen': {
      const out = reopenItem(state.log, action.kind, action.id);
      return out.ok ? { ...state, log: out.log, notice: ok('Back in the queue.') } : { ...state, notice: bad(out.reason) };
    }
    case 'edit-room':
      return applied(state, editRoom(state.audited, state.log, action.id, action.edits, action.meta), 'Room changed.');
    case 'edit-link':
      return applied(state, editLink(state.audited, state.candidates ?? emptyMap(), state.log, action.id, action.edits, action.meta), 'Link changed.');
    case 'notice':
      return { ...state, notice: action.notice };
  }
}

