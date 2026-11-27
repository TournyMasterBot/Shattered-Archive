import type { LibraryBook, LibraryNote, NoteSpool, UserNote } from './library-types';
import { MAX_CATEGORY_DEPTH } from './org-content-types';
import type { OrgContentItem, OrgContentType, OrgNoteSpool } from './org-content-types';

/**
 * "Does the editor hold something that would be lost?" for every writing surface: parchment, notes, book pages and
 * organization content. Each answer compares the draft in the editor with what is saved, so an edit that was typed
 * and then undone is not reported, and a field that does not change what is saved (a trailing space on a tag) does
 * not count. With nothing open there is no draft, so nothing can be lost.
 */

export interface WritingDraft {
  title: string;
  body: string;
  tag: string;
}

/** Tags are saved trimmed, and an empty one is saved as no tag. */
const tagOf = (tag: string | undefined): string => (tag ?? '').trim();

export function isParchmentDirty(saved: Pick<LibraryNote, 'title' | 'body' | 'tag'> | null, draft: WritingDraft): boolean {
  if (!saved) return false;
  return draft.title !== saved.title || draft.body !== saved.body || tagOf(draft.tag) !== tagOf(saved.tag);
}

export function isUserNoteDirty(
  saved: Pick<UserNote, 'subject' | 'body' | 'tag' | 'spool'> | null,
  draft: WritingDraft & { spool: NoteSpool },
): boolean {
  if (!saved) return false;
  return (
    draft.title !== saved.subject ||
    draft.body !== saved.body ||
    tagOf(draft.tag) !== tagOf(saved.tag) ||
    draft.spool !== saved.spool
  );
}

/** `savedPageBody` is the body of the page being edited ('' when that page does not exist yet). */
export function isBookPageDirty(saved: Pick<LibraryBook, 'title' | 'tag'> | null, savedPageBody: string, draft: WritingDraft): boolean {
  if (!saved) return false;
  return draft.title !== saved.title || draft.body !== savedPageBody || tagOf(draft.tag) !== tagOf(saved.tag);
}

/** A category path as it is saved: comma-separated, trimmed, empty segments dropped, at most the allowed depth. */
export function normalizeCategoryPath(text: string): string {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, MAX_CATEGORY_DEPTH)
    .join(', ');
}

export interface OrgDraft {
  title: string;
  categoryPath: string;
  body: string;
  spool: OrgNoteSpool;
}

/**
 * An organization item being edited, or a new one (`saved` is null). A new item counts only once something has been
 * typed into it. The spool only matters for notes, which is the only type that saves one.
 */
export function isOrgDraftDirty(saved: OrgContentItem | null, draft: OrgDraft, contentType: OrgContentType): boolean {
  const savedTitle = (saved?.title ?? '').trim();
  const savedBody = saved?.body ?? '';
  const savedCategory = normalizeCategoryPath((saved?.categoryPath ?? []).join(', '));
  const savedSpool: OrgNoteSpool = saved?.spool ?? 'note';

  if (draft.title.trim() !== savedTitle) return true;
  if (draft.body !== savedBody) return true;
  if (normalizeCategoryPath(draft.categoryPath) !== savedCategory) return true;
  return contentType === 'notes' && draft.spool !== savedSpool;
}

export type WritingKind = 'parchment' | 'note' | 'book page' | 'organization item';

/** The one wording used by every "you would lose this" confirmation. */
export function discardMessage(kind: WritingKind, title: string): string {
  const name = title.trim() || '(untitled)';
  return `You have unsaved changes to the ${kind} "${name}".\n\nDiscard them?`;
}
