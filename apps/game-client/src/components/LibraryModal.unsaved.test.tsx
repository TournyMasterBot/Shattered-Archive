import React from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';

// ── In-memory library store (the real one is IndexedDB) ──────────────────────────────────────────────────────────

const mockDb: { notes: any[]; userNotes: any[]; books: any[] } = { notes: [], userNotes: [], books: [] };
let mockSeq = 0;

jest.mock('../features/library/library-store', () => {
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  const put = (list: any[], item: any) => {
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = clone(item);
    else list.push(clone(item));
  };
  return {
    listNotes: jest.fn(async () => clone(mockDb.notes)),
    listBooks: jest.fn(async () => clone(mockDb.books)),
    listUserNotes: jest.fn(async () => clone(mockDb.userNotes)),
    upsertNote: jest.fn(async (n: any) => put(mockDb.notes, n)),
    upsertBook: jest.fn(async (b: any) => put(mockDb.books, b)),
    upsertUserNote: jest.fn(async (n: any) => put(mockDb.userNotes, n)),
    deleteNote: jest.fn(async (id: string) => void (mockDb.notes = mockDb.notes.filter((x) => x.id !== id))),
    deleteBook: jest.fn(async (id: string) => void (mockDb.books = mockDb.books.filter((x) => x.id !== id))),
    deleteUserNote: jest.fn(async (id: string) => void (mockDb.userNotes = mockDb.userNotes.filter((x) => x.id !== id))),
    createNote: jest.fn(async (cid: string, title: string) => {
      const n = { id: `new-note-${++mockSeq}`, connectionId: cid, title, body: '', createdAt: 1, updatedAt: 1 };
      mockDb.notes.push(n);
      return clone(n);
    }),
    createBook: jest.fn(async (cid: string, title: string) => {
      const b = { id: `new-book-${++mockSeq}`, connectionId: cid, title, keyword: '', keywordAfterTitle: '', pages: [], createdAt: 1, updatedAt: 1 };
      mockDb.books.push(b);
      return clone(b);
    }),
    createUserNote: jest.fn(async (cid: string, spool: string, subject: string) => {
      const n = { id: `new-un-${++mockSeq}`, connectionId: cid, spool, subject, body: '', createdAt: 1, updatedAt: 1 };
      mockDb.userNotes.push(n);
      return clone(n);
    }),
  };
});

// The Organizations tab has its own tests; here it only reports whether it holds unsaved work.
let mockOrgReport: ((dirty: boolean, title: string) => void) | undefined;
jest.mock('./OrganizationsPane', () => ({
  __esModule: true,
  default: ({ onDirtyChange }: { onDirtyChange?: (dirty: boolean, title: string) => void }) => {
    mockOrgReport = onDirtyChange;
    return <div>org pane</div>;
  },
}));

import { LibraryModal } from './LibraryModal';
import { createNote, createUserNote } from '../features/library/library-store';

const note = (id: string, title: string, body: string, tag?: string) => ({
  id, connectionId: 'dsl-mud', title, body, tag, createdAt: 1, updatedAt: 1,
});
const userNote = (id: string, subject: string, body: string, spool = 'note') => ({
  id, connectionId: 'dsl-mud', spool, subject, body, createdAt: 1, updatedAt: 1,
});
const book = (id: string, title: string, pages: Array<{ page: number; body: string }>) => ({
  id, connectionId: 'dsl-mud', title, keyword: '', keywordAfterTitle: '', pages, createdAt: 1, updatedAt: 1,
});

let confirmSpy: jest.SpyInstance;
let onClose: jest.Mock;

async function open() {
  onClose = jest.fn();
  await act(async () => {
    render(<LibraryModal isOpen onClose={onClose} connectionId="dsl-mud" />);
  });
}

const tab = (name: string) => screen.getByRole('button', { name });
const clickTab = async (name: string) => act(async () => void fireEvent.click(tab(name)));
const row = (label: string) => screen.getByText(label).closest('button')!;
const clickRow = async (label: string) => act(async () => void fireEvent.click(row(label)));
const body = () => screen.getByPlaceholderText(/^Type (parchment|note|page) text here/) as HTMLTextAreaElement;
const typeBody = (text: string) => act(() => void fireEvent.change(body(), { target: { value: text } }));
const typeTag = (text: string) =>
  act(() => void fireEvent.change(screen.getByPlaceholderText('Tag (optional, for grouping)'), { target: { value: text } }));

beforeEach(() => {
  mockDb.notes = [note('p1', 'Alpha', 'alpha body'), note('p2', 'Beta', 'beta body')];
  mockDb.userNotes = [userNote('n1', 'Hello', 'hello body'), userNote('n2', 'World', 'world body')];
  mockDb.books = [book('b1', 'Tome', [{ page: 1, body: 'page one' }, { page: 2, body: 'page two' }]), book('b2', 'Codex', [{ page: 1, body: 'codex one' }])];
  mockOrgReport = undefined;
  confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  jest.clearAllMocks();
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('LibraryModal parchment', () => {
  const pick = async () => {
    await open();
    await clickRow('Alpha');
    expect(body().value).toBe('alpha body');
  };

  it('moves to another parchment without asking when nothing was changed', async () => {
    await pick();
    await clickRow('Beta');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(body().value).toBe('beta body');
  });

  it('asks before moving to another parchment with unsaved text, naming what would be lost', async () => {
    await pick();
    typeBody('alpha body, edited');

    confirmSpy.mockReturnValue(false);
    await clickRow('Beta');

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('parchment "Alpha"');
    expect(body().value).toBe('alpha body, edited');
  });

  it('moves on and drops the draft once the user agrees', async () => {
    await pick();
    typeBody('alpha body, edited');

    await clickRow('Beta');

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(body().value).toBe('beta body');
    await clickRow('Alpha');
    expect(body().value).toBe('alpha body');
  });

  it('does not ask when the same parchment is clicked again', async () => {
    await pick();
    typeBody('edited');
    await clickRow('Alpha');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(body().value).toBe('edited');
  });

  it('does not ask when the edit was typed back to what is saved', async () => {
    await pick();
    typeBody('alpha body!');
    typeBody('alpha body');
    await clickRow('Beta');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('asks when only the tag changed', async () => {
    await pick();
    typeTag('lore');
    confirmSpy.mockReturnValue(false);
    await clickRow('Beta');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it('does not ask after the draft has been saved', async () => {
    await pick();
    typeBody('alpha body, edited');

    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(mockDb.notes.find((n) => n.id === 'p1').body).toBe('alpha body, edited'));
    await clickRow('Beta');

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(body().value).toBe('beta body');
  });

  it('asks before switching to another tab, and stays put when declined', async () => {
    await pick();
    typeBody('edited');

    confirmSpy.mockReturnValue(false);
    await clickTab('Notes');

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(body().value).toBe('edited');
    expect(screen.getByRole('button', { name: 'New Parchment' })).toBeTruthy();
  });

  it('switches tab when agreed', async () => {
    await pick();
    typeBody('edited');
    await clickTab('Notes');
    expect(screen.getByRole('button', { name: 'New Note' })).toBeTruthy();
  });

  it('asks once when leaving, and not again on the next tab, whose own editor holds nothing unsaved', async () => {
    await pick();
    typeBody('edited');
    await clickTab('Notes');
    expect(confirmSpy).toHaveBeenCalledTimes(1);

    await clickRow('Hello');
    await clickRow('World');
    await clickTab('Books');

    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it('a closed library no longer holds the browser tab, even though its draft state is kept', async () => {
    onClose = jest.fn();
    let rerender!: (ui: React.ReactElement) => void;
    await act(async () => {
      rerender = render(<LibraryModal isOpen onClose={onClose} connectionId="dsl-mud" />).rerender;
    });
    await clickRow('Alpha');
    typeBody('edited');
    const unload = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(unload()).toBe(true);

    await act(async () => rerender(<LibraryModal isOpen={false} onClose={onClose} connectionId="dsl-mud" />));

    expect(unload()).toBe(false);
  });

  it('asks before another parchment is picked in the Scribe panel', async () => {
    await pick();
    typeBody('edited');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Scribe…' })));
    const picker = screen.getAllByRole('combobox').find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === 'p2'))!;

    confirmSpy.mockReturnValue(false);
    await act(async () => void fireEvent.change(picker, { target: { value: 'p2' } }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(body().value).toBe('edited');
  });

  it('does not ask when the parchment already open is picked again in the Scribe panel', async () => {
    await pick();
    typeBody('edited');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Scribe…' })));
    const picker = screen.getAllByRole('combobox').find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === 'p2'))!;

    await act(async () => void fireEvent.change(picker, { target: { value: 'p1' } }));

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('asks before creating a new parchment, and creates nothing when declined', async () => {
    await pick();
    typeBody('edited');

    confirmSpy.mockReturnValue(false);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'New Parchment' })));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(createNote).not.toHaveBeenCalled();
    expect(body().value).toBe('edited');
  });

  it('creates it when agreed', async () => {
    await pick();
    typeBody('edited');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'New Parchment' })));
    expect(createNote).toHaveBeenCalledTimes(1);
  });

  it('asks before importing a file, which reloads the library under the editor', async () => {
    await pick();
    typeBody('edited');
    const clickInput = jest.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    confirmSpy.mockReturnValue(false);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Import JSON' })));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(clickInput).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Import JSON' })));
    expect(clickInput).toHaveBeenCalledTimes(1);
  });

  it('asks before the close button closes the library, and keeps it open when declined', async () => {
    await pick();
    typeBody('edited');

    confirmSpy.mockReturnValue(false);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: '✕' })));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: '✕' })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes without asking when nothing is unsaved', async () => {
    await pick();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: '✕' })));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('LibraryModal notes', () => {
  const pick = async () => {
    await open();
    await clickTab('Notes');
    await clickRow('Hello');
    expect(body().value).toBe('hello body');
  };

  it('asks before moving to another note with unsaved text', async () => {
    await pick();
    typeBody('hello edited');

    confirmSpy.mockReturnValue(false);
    await clickRow('World');

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('note "Hello"');
    expect(body().value).toBe('hello edited');
  });

  it('does not ask when nothing changed, and moves', async () => {
    await pick();
    await clickRow('World');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(body().value).toBe('world body');
  });

  it('does not ask when the same note is clicked again', async () => {
    await pick();
    typeBody('hello edited');
    await clickRow('Hello');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(body().value).toBe('hello edited');
  });

  it('asks before creating a new note, and creates nothing when declined', async () => {
    await pick();
    typeBody('hello edited');
    confirmSpy.mockReturnValue(false);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'New Note' })));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(createUserNote).not.toHaveBeenCalled();
    expect(body().value).toBe('hello edited');
  });

  it('asks before another note is picked in the Scribe panel', async () => {
    await pick();
    typeBody('hello edited');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Scribe…' })));
    const picker = screen.getAllByRole('combobox').find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === 'n2'))!;

    confirmSpy.mockReturnValue(false);
    await act(async () => void fireEvent.change(picker, { target: { value: 'n2' } }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(body().value).toBe('hello edited');
  });

  it('asks when only the spool changed', async () => {
    await pick();
    const spool = screen.getAllByRole('combobox').find((s) => (s as HTMLSelectElement).value === 'note')!;
    act(() => void fireEvent.change(spool, { target: { value: 'news' } }));

    confirmSpy.mockReturnValue(false);
    await clickRow('World');

    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it('asks before switching away to the parchment tab', async () => {
    await pick();
    typeBody('hello edited');
    confirmSpy.mockReturnValue(false);
    await clickTab('Parchment');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'New Note' })).toBeTruthy();
  });
});

describe('LibraryModal books', () => {
  const pick = async () => {
    await open();
    await clickTab('Books');
    await clickRow('Tome');
    expect(body().value).toBe('page one');
  };

  it('asks before moving to another book with an unsaved page', async () => {
    await pick();
    typeBody('page one, edited');

    confirmSpy.mockReturnValue(false);
    await clickRow('Codex');

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('book page "Tome"');
    expect(body().value).toBe('page one, edited');
  });

  it('asks before turning the page', async () => {
    await pick();
    typeBody('page one, edited');

    confirmSpy.mockReturnValue(false);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: '▶' })));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(body().value).toBe('page one, edited');
  });

  it('turns the page without asking when nothing changed', async () => {
    await pick();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: '▶' })));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(body().value).toBe('page two');
  });

  it('asks before leaving the tab when only the tag changed', async () => {
    await pick();
    typeTag('rare');
    confirmSpy.mockReturnValue(false);
    await clickTab('Parchment');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it('asks before another book is picked in the Scribe panel', async () => {
    await pick();
    typeBody('page one, edited');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Scribe…' })));
    const picker = screen.getAllByRole('combobox').find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === 'b2'))!;

    confirmSpy.mockReturnValue(false);
    await act(async () => void fireEvent.change(picker, { target: { value: 'b2' } }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(body().value).toBe('page one, edited');
  });

  it('does not ask when the same book is clicked again', async () => {
    await pick();
    typeBody('edited');
    await clickRow('Tome');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('asks before creating a new book', async () => {
    await pick();
    typeBody('edited');
    confirmSpy.mockReturnValue(false);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'New Book' })));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });
});

describe('LibraryModal organizations tab', () => {
  const openOrgs = async () => {
    await open();
    await clickTab('Organizations');
    expect(mockOrgReport).toBeDefined();
  };

  it('asks before leaving the tab while the pane reports unsaved work, naming it', async () => {
    await openOrgs();
    act(() => mockOrgReport!(true, 'Charter'));

    confirmSpy.mockReturnValue(false);
    await clickTab('Notes');

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('organization item "Charter"');
    expect(screen.getByText('org pane')).toBeTruthy();
  });

  it('leaves the tab freely when the pane reports nothing unsaved', async () => {
    await openOrgs();
    act(() => mockOrgReport!(true, 'Charter'));
    act(() => mockOrgReport!(false, 'Charter'));
    await clickTab('Notes');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('asks once on leaving the tab, and the library does not go on asking afterwards', async () => {
    await openOrgs();
    act(() => mockOrgReport!(true, 'Charter'));

    await clickTab('Notes');
    expect(confirmSpy).toHaveBeenCalledTimes(1);

    await clickTab('Books');
    await clickTab('Parchment');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it('asks before closing the library with unsaved organization work', async () => {
    await openOrgs();
    act(() => mockOrgReport!(true, 'Charter'));
    confirmSpy.mockReturnValue(false);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: '✕' })));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('LibraryModal browser tab close', () => {
  const unload = () => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  };

  it('is held while the editor has unsaved changes, and released once they are gone', async () => {
    await open();
    await clickRow('Alpha');
    expect(unload()).toBe(false);

    typeBody('edited');
    expect(unload()).toBe(true);

    typeBody('alpha body');
    expect(unload()).toBe(false);
  });
});
