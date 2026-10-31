import {
  discardMessage,
  isBookPageDirty,
  isOrgDraftDirty,
  isParchmentDirty,
  isUserNoteDirty,
  normalizeCategoryPath,
} from './unsavedChanges';
import { MAX_CATEGORY_DEPTH } from './org-content-types';

const parchment = { title: 'Alpha', body: 'alpha body', tag: 'lore' };
const same = { title: 'Alpha', body: 'alpha body', tag: 'lore' };

describe('isParchmentDirty', () => {
  it('is false for an unchanged draft', () => {
    expect(isParchmentDirty(parchment, same)).toBe(false);
  });

  it('is false when nothing is open, whatever the editor holds', () => {
    expect(isParchmentDirty(null, { title: 'typed', body: 'typed', tag: 'x' })).toBe(false);
  });

  it('is true when the title, the body or the tag differs', () => {
    expect(isParchmentDirty(parchment, { ...same, title: 'Alpha!' })).toBe(true);
    expect(isParchmentDirty(parchment, { ...same, body: 'alpha body.' })).toBe(true);
    expect(isParchmentDirty(parchment, { ...same, tag: 'other' })).toBe(true);
  });

  it('is false once an edit has been typed back to what is saved', () => {
    expect(isParchmentDirty(parchment, { ...same, body: 'alpha body!' })).toBe(true);
    expect(isParchmentDirty(parchment, { ...same, body: 'alpha body' })).toBe(false);
  });

  it('ignores surrounding spaces on a tag, and treats a blank tag as no tag', () => {
    expect(isParchmentDirty(parchment, { ...same, tag: '  lore ' })).toBe(false);
    expect(isParchmentDirty({ ...parchment, tag: undefined }, { ...same, tag: '   ' })).toBe(false);
    expect(isParchmentDirty({ ...parchment, tag: undefined }, { ...same, tag: 'lore' })).toBe(true);
  });

  it('does not ignore spaces in the title or body, because they are saved', () => {
    expect(isParchmentDirty(parchment, { ...same, title: 'Alpha ' })).toBe(true);
    expect(isParchmentDirty(parchment, { ...same, body: 'alpha body ' })).toBe(true);
  });
});

describe('isUserNoteDirty', () => {
  const note = { subject: 'Hello', body: 'hello body', tag: undefined, spool: 'note' as const };
  const draft = { title: 'Hello', body: 'hello body', tag: '', spool: 'note' as const };

  it('is false for an unchanged draft and when nothing is open', () => {
    expect(isUserNoteDirty(note, draft)).toBe(false);
    expect(isUserNoteDirty(null, { ...draft, body: 'typed' })).toBe(false);
  });

  it('is true when the subject, body, tag or spool differs', () => {
    expect(isUserNoteDirty(note, { ...draft, title: 'Hi' })).toBe(true);
    expect(isUserNoteDirty(note, { ...draft, body: 'x' })).toBe(true);
    expect(isUserNoteDirty(note, { ...draft, tag: 'x' })).toBe(true);
    expect(isUserNoteDirty(note, { ...draft, spool: 'news' })).toBe(true);
  });
});

describe('isBookPageDirty', () => {
  const book = { title: 'Tome', tag: undefined };
  const draft = { title: 'Tome', body: 'page one', tag: '' };

  it('compares the draft with the page being edited', () => {
    expect(isBookPageDirty(book, 'page one', draft)).toBe(false);
    expect(isBookPageDirty(book, 'a different page', draft)).toBe(true);
  });

  it('counts a changed title or tag, which the old book-only check missed for tags', () => {
    expect(isBookPageDirty(book, 'page one', { ...draft, title: 'Tome II' })).toBe(true);
    expect(isBookPageDirty(book, 'page one', { ...draft, tag: 'x' })).toBe(true);
  });

  it('treats a page that does not exist yet as empty', () => {
    expect(isBookPageDirty(book, '', { ...draft, body: '' })).toBe(false);
    expect(isBookPageDirty(book, '', { ...draft, body: 'new text' })).toBe(true);
  });

  it('is false when no book is open', () => {
    expect(isBookPageDirty(null, '', { ...draft, body: 'x' })).toBe(false);
  });
});

describe('normalizeCategoryPath', () => {
  it('trims, drops empty segments and keeps the saved depth', () => {
    expect(normalizeCategoryPath(' a ,, b , ')).toBe('a, b');
    expect(normalizeCategoryPath('')).toBe('');
    const long = Array.from({ length: MAX_CATEGORY_DEPTH + 3 }, (_, i) => `s${i}`).join(', ');
    expect(normalizeCategoryPath(long).split(', ')).toHaveLength(MAX_CATEGORY_DEPTH);
  });
});

describe('isOrgDraftDirty', () => {
  const item = { id: 'i1', title: 'Charter', categoryPath: ['Rules', 'Joining'], body: 'text', spool: 'note' as const };
  const draft = { title: 'Charter', categoryPath: 'Rules, Joining', body: 'text', spool: 'note' as const };

  it('is false for an unchanged draft', () => {
    expect(isOrgDraftDirty(item, draft, 'parchment')).toBe(false);
  });

  it('is true when the title, body or category changed', () => {
    expect(isOrgDraftDirty(item, { ...draft, title: 'Charter 2' }, 'parchment')).toBe(true);
    expect(isOrgDraftDirty(item, { ...draft, body: 'text!' }, 'parchment')).toBe(true);
    expect(isOrgDraftDirty(item, { ...draft, categoryPath: 'Rules' }, 'parchment')).toBe(true);
  });

  it('ignores spacing the save would remove: title ends, and spacing around category segments', () => {
    expect(isOrgDraftDirty(item, { ...draft, title: '  Charter ' }, 'parchment')).toBe(false);
    expect(isOrgDraftDirty(item, { ...draft, categoryPath: ' Rules ,Joining,' }, 'parchment')).toBe(false);
  });

  it('only counts the spool for notes, the one type that saves it', () => {
    expect(isOrgDraftDirty(item, { ...draft, spool: 'news' }, 'parchment')).toBe(false);
    expect(isOrgDraftDirty(item, { ...draft, spool: 'news' }, 'books')).toBe(false);
    expect(isOrgDraftDirty(item, { ...draft, spool: 'news' }, 'notes')).toBe(true);
  });

  it('treats an item with no saved title, category or spool as empty', () => {
    const bare = { id: 'i2', body: 'x' };
    expect(isOrgDraftDirty(bare, { title: '', categoryPath: '', body: 'x', spool: 'note' }, 'notes')).toBe(false);
  });

  it('a new item is dirty only once something has been typed', () => {
    const blank = { title: '', categoryPath: '', body: '', spool: 'note' as const };
    expect(isOrgDraftDirty(null, blank, 'notes')).toBe(false);
    expect(isOrgDraftDirty(null, { ...blank, body: 'a' }, 'notes')).toBe(true);
    expect(isOrgDraftDirty(null, { ...blank, title: 'a' }, 'parchment')).toBe(true);
    expect(isOrgDraftDirty(null, { ...blank, categoryPath: 'a' }, 'parchment')).toBe(true);
    expect(isOrgDraftDirty(null, { ...blank, title: '   ' }, 'parchment')).toBe(false);
  });
});

describe('discardMessage', () => {
  it('names what would be lost', () => {
    expect(discardMessage('parchment', 'Alpha')).toContain('parchment "Alpha"');
    expect(discardMessage('book page', 'Tome')).toContain('book page "Tome"');
  });

  it('calls an untitled item (untitled) and ends by asking to discard', () => {
    const m = discardMessage('note', '   ');
    expect(m).toContain('"(untitled)"');
    expect(m.trimEnd().endsWith('Discard them?')).toBe(true);
  });
});
