import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { candidatesMap } from '../testing/neutralFixtures';
import { doc, room as legacyRoom, exit as legacyExit } from '../testing/fixtures';
import NeutralApp from './NeutralApp';
import { AUDITED_KEY, REVIEW_KEY } from './persist';
import { useNeutral } from './state';
import { initialState, neutralReducer, type NeutralState } from './store';

/** The whole viewer: opening files, zooming, reviewing candidates into the audited file, and editing it. */

const reviewing = (): NeutralState =>
  [
    { type: 'open-candidates', map: candidatesMap(), name: 'azah.json' } as const,
    { type: 'focus', focus: { level: 'subzone', id: 's-fields' } } as const,
  ].reduce(neutralReducer, initialState());

const stored = <T,>(key: string): T => JSON.parse(localStorage.getItem(key) ?? 'null') as T;
const status = () => screen.getByRole('status');
const pick = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const jsonFile = (name: string, value: unknown) => ({ name, arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer });

beforeEach(() => {
  localStorage.clear();
});

describe('an empty viewer', () => {
  it('says what to do, offers no zoom control, and keeps the candidates view out of reach', () => {
    render(<NeutralApp initial={initialState()} />);
    expect(screen.getByRole('heading', { name: 'The audited file is empty' })).toBeTruthy();
    expect(screen.queryByRole('toolbar', { name: 'Zoom level' })).toBeNull();
    expect((screen.getByRole('radio', { name: /Candidates/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('link', { name: 'Classic editor' }).getAttribute('href')).toBe('#/legacy');
  });

  it('reads the audited file and the review log from the browser when it starts', () => {
    localStorage.setItem(AUDITED_KEY, JSON.stringify(candidatesMap()));
    render(<NeutralApp />);
    expect(screen.getByRole('toolbar', { name: 'Zoom level' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Greenmarch' })).toBeTruthy();
  });
});

describe('reviewing candidates', () => {
  it('lists what is waiting in the view, with the totals for the whole file', () => {
    render(<NeutralApp initial={reviewing()} />);
    expect(screen.getByRole('heading', { name: 'Waiting in this view (8)' })).toBeTruthy();
    const tally = screen.getByText(/to review/).parentElement as HTMLElement;
    expect(tally.textContent).toBe('10 to review0 accepted0 changed0 rejected');
  });

  it('accepts a room with the curator\'s note: it enters the audited file, is marked on the drawing, and is kept across a reload', async () => {
    render(<NeutralApp initial={reviewing()} />);
    fireEvent.change(screen.getByLabelText('Note for the decision'), { target: { value: 'looked in game' } });
    pick(/room The Barn/);
    expect(within(screen.getByLabelText('Selected item')).getByText('not decided')).toBeTruthy();
    pick(/^Accept$/);
    expect(status().textContent).toContain('Room accepted.');
    await waitFor(() => expect(stored<{ continents: { areas: { subzones: { rooms: { id: string }[] }[] }[] }[] }>(AUDITED_KEY).continents[0].areas[0].subzones[0].rooms.map((r) => r.id)).toEqual(['r-barn']));
    expect(stored<{ decisions: { id: string; note: string; status: string }[] }>(REVIEW_KEY).decisions).toMatchObject([{ id: 'r-barn', note: 'looked in game', status: 'accepted' }]);
    expect(document.querySelector('svg [data-review="accepted"]')?.getAttribute('data-room')).toBe('r-barn');
    expect(screen.getByRole('heading', { name: 'Waiting in this view (7)' })).toBeTruthy();
    expect(screen.getByText(/1 accepted/)).toBeTruthy();
  });

  it('rejects a room, which leaves the queue, and puts it back when asked', () => {
    render(<NeutralApp initial={reviewing()} />);
    pick(/room The Well/);
    pick(/^Reject$/);
    expect(status().textContent).toContain('Room rejected.');
    expect(screen.getByRole('heading', { name: 'Waiting in this view (7)' })).toBeTruthy();
    expect(within(screen.getByLabelText('Selected item')).getByText('rejected')).toBeTruthy();
    expect(document.querySelector('svg [data-review="rejected"]')?.getAttribute('data-room')).toBe('r-well');
    pick(/Put back in the queue/);
    expect(status().textContent).toContain('Back in the queue.');
    expect(screen.getByRole('heading', { name: 'Waiting in this view (8)' })).toBeTruthy();
    expect(document.querySelector('svg [data-review]')).toBeNull();
  });

  it('accepts a room with changes: the audited copy has them, the candidate does not, the log names the fields', async () => {
    render(<NeutralApp initial={reviewing()} />);
    pick(/room The Gate/);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'The Great Gate' } });
    pick(/Accept with these changes/);
    await waitFor(() => expect(localStorage.getItem(AUDITED_KEY)).toContain('The Great Gate'));
    expect(stored<{ decisions: { status: string; edits: string[] }[] }>(REVIEW_KEY).decisions[0]).toMatchObject({ status: 'edited', edits: ['title'] });
    expect(screen.getByText(/1 changed/)).toBeTruthy();
    expect(within(screen.getByLabelText('Selected item')).getByText('edited')).toBeTruthy();
  });

  it('accepts a link chosen from its room\'s exits, with a new target', async () => {
    render(<NeutralApp initial={reviewing()} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'The Gate' })[0]);
    fireEvent.click(within(screen.getByRole('region', { name: 'Exits' })).getByRole('button', { name: /N goes somewhere unknown/ }));
    expect(within(screen.getByLabelText('Selected item')).getByText('The Gate N')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Goes to'), { target: { value: 'r-barn' } });
    pick(/Accept with these changes/);
    expect(status().textContent).toContain('Link accepted.');
    await waitFor(() => expect(stored<{ links: { id: string; to: string }[] }>(AUDITED_KEY).links).toMatchObject([{ id: 'l3', to: 'r-barn' }]));
  });

  it('accepts everything waiting in the view at once, and tells how many', async () => {
    render(<NeutralApp initial={reviewing()} />);
    pick(/Accept all 8 in this view/);
    expect(status().textContent).toBe('Accepted 8 of 8.×');
    expect(screen.getByText('Everything in this view has been decided.')).toBeTruthy();
    await waitFor(() => expect(stored<{ links: unknown[] }>(AUDITED_KEY).links).toHaveLength(5));
    const tally = screen.getByText(/to review/).parentElement as HTMLElement;
    expect(tally.textContent).toBe('2 to review8 accepted0 changed0 rejected');
  });

  it('asks for a zoom to a place before listing anything at the continent level', () => {
    const state = neutralReducer(reviewing(), { type: 'focus', focus: { level: 'continent', id: 'c-green' } });
    render(<NeutralApp initial={state} />);
    expect(screen.getByText('Zoom to an area, a subzone or a room to review what is in it.')).toBeTruthy();
  });

  it('shows a refusal as an alert the curator can dismiss', () => {
    const state = neutralReducer(reviewing(), { type: 'accept-room', id: 'nope', meta: { at: '2026-11-07' } });
    render(<NeutralApp initial={state} />);
    expect(screen.getByRole('alert').textContent).toContain('the room is not a live room of the candidates file');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the audited file', () => {
  const audited = (): NeutralState => neutralReducer(initialState(candidatesMap()), { type: 'focus', focus: { level: 'subzone', id: 's-fields' } });

  it('counts its live rooms (a merged-away room is not one) and links', () => {
    render(<NeutralApp initial={audited()} />);
    expect(screen.getByText(/5 rooms and 5 links/)).toBeTruthy();
  });

  it('changes a selected room, with a note, and the change is kept', async () => {
    render(<NeutralApp initial={audited()} />);
    fireEvent.click(screen.getByRole('button', { name: 'The Gate' }));
    fireEvent.change(screen.getByLabelText('Note for the change'), { target: { value: 'iron' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A tall iron gate.' } });
    pick(/Save changes to the room/);
    expect(status().textContent).toContain('Room changed.');
    await waitFor(() => expect(localStorage.getItem(AUDITED_KEY)).toContain('A tall iron gate.'));
    expect(stored<{ decisions: { note: string }[] }>(REVIEW_KEY).decisions[0].note).toBe('iron');
    expect(screen.getByText('A tall iron gate.', { selector: 'p' })).toBeTruthy();
  });

  it('changes a selected link: where it goes', async () => {
    render(<NeutralApp initial={audited()} />);
    fireEvent.click(screen.getByRole('button', { name: 'The Gate' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Exits' })).getByRole('button', { name: /N goes somewhere unknown/ }));
    fireEvent.change(screen.getByLabelText('Goes to'), { target: { value: 'r-well' } });
    pick(/Save changes to the link/);
    expect(status().textContent).toContain('Link changed.');
    await waitFor(() => expect(stored<{ links: { id: string; to: string | null }[] }>(AUDITED_KEY).links.find((l) => l.id === 'l3')?.to).toBe('r-well'));
  });

  it('says to select something when nothing is selected', () => {
    render(<NeutralApp initial={audited()} />);
    expect(screen.getByText('Select a room, or one of its exits, to change it.')).toBeTruthy();
  });

  it('refuses a change that changes nothing, in an alert', () => {
    render(<NeutralApp initial={audited()} />);
    fireEvent.click(screen.getByRole('button', { name: 'The Gate' }));
    pick(/Save changes to the room/);
    expect(screen.getByRole('alert').textContent).toContain('nothing changed');
  });

  it('warns when the browser will not keep the work', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    render(<NeutralApp initial={audited()} />);
    fireEvent.click(screen.getByRole('button', { name: 'The Gate' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Another' } });
    pick(/Save changes to the room/);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Download it now so the work is not lost'));
    setItem.mockRestore();
  });
});

describe('opening and saving files', () => {
  const open = async (label: string, file: unknown) => {
    await act(async () => {
      fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
    });
  };
  afterEach(() => jest.restoreAllMocks());

  it('opens a candidates map file and shows it from its first continent', async () => {
    render(<NeutralApp initial={initialState()} />);
    await open('Open a candidates file', jsonFile('walked.json', candidatesMap()));
    expect(await screen.findByRole('heading', { name: 'Greenmarch' })).toBeTruthy();
    expect(status().textContent).toContain('Opened walked.json.');
    expect((screen.getByRole('radio', { name: /Candidates \(walked.json\)/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('list', { name: 'Areas' })).toBeTruthy();
  });

  it('reads a DslMapper document through the adapter and shows what it left behind', async () => {
    const legacy = doc([legacyRoom('a', 0, 0, 0, { E: legacyExit('b', { door: { type: 'simple' } }) }, 'Alpha'), legacyRoom('b', 1, 0, 0, {}, 'Beta')]);
    render(<NeutralApp initial={initialState()} />);
    await open('Open a candidates file', jsonFile('classic.json', legacy));
    const report = await screen.findByText(/Read 2 rooms and 1 exits from the DslMapper document \(1 continents, 1 areas\)/);
    expect(report.closest('details')?.textContent).toContain('Not carried over: exit door or lock (1).');
    expect(screen.getByRole('radio', { name: /classic.json \(DslMapper document\)/ })).toBeTruthy();
  });

  it('refuses a file that is not a map, with the reason', async () => {
    render(<NeutralApp initial={initialState()} />);
    await open('Open a candidates file', jsonFile('junk.json', { hello: 1 }));
    expect((await screen.findByRole('alert')).textContent).toContain('neither a map file');
    await open('Open a candidates file', jsonFile('bad.json', { version: 1, continents: 'x', links: [] }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Not a valid map file'));
  });

  it('truncates a long list of reasons, and ignores a cancelled file dialog', async () => {
    render(<NeutralApp initial={initialState()} />);
    const broken = candidatesMap();
    broken.links = Array.from({ length: 6 }, (_, i) => ({ ...broken.links[0], id: `x${i}`, from: 'nowhere' }));
    await open('Open a candidates file', jsonFile('many.json', broken));
    expect((await screen.findByRole('alert')).textContent).toMatch(/\(and \d+ more\)×$/); // the dismiss button's × ends the alert
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Open a candidates file'), { target: { files: [] } });
    });
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('opens an audited file; a DslMapper document is not accepted there; replacing needs a yes', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<NeutralApp initial={initialState()} />);
    await open('Open the audited file', jsonFile('classic.json', doc([legacyRoom('a', 0, 0, 0, {}, 'Alpha')])));
    expect((await screen.findByRole('alert')).textContent).toContain('Open it as the candidates file');
    await open('Open the audited file', jsonFile('junk.json', []));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('not a JSON object'));
    await open('Open the audited file', jsonFile('audited.json', candidatesMap()));
    expect(await screen.findByRole('heading', { name: 'Greenmarch' })).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled(); // nothing to replace yet
    // now there is an audited file: declining keeps it, agreeing replaces it
    const other = candidatesMap();
    other.continents[0].name = 'Elsewhere';
    await open('Open the audited file', jsonFile('other.json', other));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Greenmarch' })).toBeTruthy();
    confirm.mockReturnValue(true);
    await open('Open the audited file', jsonFile('other.json', other));
    expect(await screen.findByRole('heading', { name: 'Elsewhere' })).toBeTruthy();
  });

  it('downloads the audited file and the review log under dated names', () => {
    const blobs: Blob[] = [];
    Object.assign(URL, {
      createObjectURL: jest.fn((b: Blob) => {
        blobs.push(b);
        return 'blob:test';
      }),
      revokeObjectURL: jest.fn(),
    });
    const names: string[] = [];
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    render(<NeutralApp initial={neutralReducer(initialState(), { type: 'open-audited', map: candidatesMap() })} />);
    pick(/Download audited file/);
    pick(/Download review log/);
    expect(names).toHaveLength(2);
    expect(names[0]).toMatch(/^audited-map-\d{4}-\d{2}-\d{2}\.json$/);
    expect(names[1]).toMatch(/^review-log-\d{4}-\d{2}-\d{2}\.json$/);
    expect(blobs.map((b) => b.type)).toEqual(['application/json', 'application/json']);
    expect(blobs.every((b) => b.size > 10)).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('empties the audited file only after a yes', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<NeutralApp initial={neutralReducer(initialState(), { type: 'open-audited', map: candidatesMap() })} />);
    pick(/Empty audited file/);
    expect(screen.getByRole('heading', { name: 'Greenmarch' })).toBeTruthy();
    confirm.mockReturnValue(true);
    pick(/Empty audited file/);
    expect(screen.getByRole('heading', { name: 'The audited file is empty' })).toBeTruthy();
    expect(status().textContent).toContain('empty again');
  });

  it('switches between the audited file and the candidates', () => {
    render(<NeutralApp initial={reviewing()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Audited' }));
    expect(screen.getByRole('heading', { name: 'The audited file is empty' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Candidates/ }));
    expect(screen.getByRole('heading', { name: 'Candidate review' })).toBeTruthy();
  });
});

describe('more of the review panel', () => {
  it('accepts a room with a new terrain, and a link vouched for as confirmed', async () => {
    render(<NeutralApp initial={reviewing()} />);
    pick(/room The Well/);
    fireEvent.change(screen.getByLabelText('Terrain'), { target: { value: 'swamp' } });
    pick(/Accept with these changes/);
    await waitFor(() => expect(localStorage.getItem(AUDITED_KEY)).toContain('swamp'));
    fireEvent.click(screen.getAllByRole('button', { name: 'The Well' })[0]);
    fireEvent.click(within(screen.getByRole('region', { name: 'Exits' })).getByRole('button', { name: /E seen once or imported/ }));
    fireEvent.change(screen.getByLabelText('Vouch for it as'), { target: { value: 'confirmed' } });
    pick(/Accept with these changes/);
    await waitFor(() => expect(stored<{ links: { id: string; state: string }[] }>(AUDITED_KEY).links).toMatchObject([{ id: 'l4', state: 'confirmed' }]));
  });

  it('offers a target on another page as it is when editing a link that leaves the page', () => {
    render(<NeutralApp initial={neutralReducer(reviewing(), { type: 'select', selected: { kind: 'link', id: 'l4' } })} />);
    const goesTo = screen.getByLabelText('Goes to') as HTMLSelectElement;
    expect(goesTo.value).toBe('r-quay');
    expect([...goesTo.options].some((o) => o.textContent === 'r-quay (another page)')).toBe(true);
  });

  it('opens on the floor with the most rooms and shows another when its button is pressed', () => {
    const tall = candidatesMap();
    tall.continents[0].areas[0].subzones[0].rooms[2].coords = { x: 1, y: 1, z: 1 };
    const state = [{ type: 'open-candidates', map: tall, name: 't.json' } as const, { type: 'focus', focus: { level: 'subzone', id: 's-fields' } } as const].reduce(neutralReducer, initialState());
    render(<NeutralApp initial={state} />);
    expect(document.querySelectorAll('svg polygon[data-room]')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Floor 1/ }));
    expect([...document.querySelectorAll('svg polygon[data-room]')].map((p) => p.getAttribute('data-room'))).toEqual(['r-well']);
  });

  it('says nothing was left behind when a DslMapper document maps completely', async () => {
    const plain = doc([legacyRoom('a', 0, 0, 0, {}, 'Alpha')]);
    delete plain.meta.catalog!.continents.c.worldId; // a world is the one thing the neutral file has no level for
    render(<NeutralApp initial={initialState()} />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Open a candidates file'), { target: { files: [jsonFile('plain.json', plain)] } });
    });
    expect(await screen.findByText('Nothing was left behind.')).toBeTruthy();
  });

  it('cannot be used outside its provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const Probe = () => {
      useNeutral();
      return null;
    };
    expect(() => render(<Probe />)).toThrow('useNeutral must be used inside <NeutralProvider>');
    spy.mockRestore();
  });
});

describe('zooming', () => {
  it('zooms from the continent down to a room by its areas and rooms, and back out', () => {
    render(<NeutralApp initial={neutralReducer(initialState(), { type: 'open-candidates', map: candidatesMap(), name: 'c.json' })} />);
    fireEvent.click(within(screen.getByRole('list', { name: 'Areas' })).getByRole('button', { name: /North Farm/ }));
    expect(screen.getByRole('heading', { name: 'North Farm' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Fields/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in to The Well' }));
    expect(screen.getByRole('article', { name: 'Room The Well' })).toBeTruthy();
    expect(screen.getByText('Greenmarch › North Farm › Fields')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out one level' }));
    expect(screen.getByRole('heading', { name: /Fields/ })).toBeTruthy();
    // the room an exit leads to can be opened from the room panel
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in to The Gate' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Exits' })).getByRole('button', { name: 'The Barn' }));
    expect(screen.getByRole('article', { name: 'Room The Barn' })).toBeTruthy();
  });

  it('shows the room panel of the room a selected exit starts at', () => {
    const state = neutralReducer(reviewing(), { type: 'select', selected: { kind: 'link', id: 'l4' } });
    render(<NeutralApp initial={state} />);
    expect(screen.getByRole('article', { name: 'Room The Well' })).toBeTruthy();
  });
});
