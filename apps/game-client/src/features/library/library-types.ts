// apps\game-client\src\features\library\library-types.ts
export type LibraryId = string;

// ── Canonical JSON export/import format ───────────────────────────────────────
// Shared across the web client, mobile client, and public server.
// IDs are omitted intentionally — new ones are assigned on import.

export interface LibraryExportBundle {
  version: 1;
  exportedAt: number;
  parchment?: ParchmentExport[];
  notes?: NoteExport[];
  books?: BookExport[];
}

export interface ParchmentExport {
  title: string;
  body: string;
  /** Optional user-assigned tag used to group items in the tree. */
  tag?: string;
  createdAt: number;
  updatedAt: number;
}

export interface NoteExport {
  spool: NoteSpool;
  subject: string;
  body: string;
  /** Saved recipients for the "to" line — stored verbatim, reused on re-scribe. */
  recipients?: string[];
  /** Optional user-assigned tag used to group items within a spool. */
  tag?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BookExport {
  title: string;
  keyword: string;
  keywordAfterTitle: string;
  /** Optional user-assigned tag used to group items in the tree. */
  tag?: string;
  pages: Array<{ page: number; body: string }>;
  createdAt: number;
  updatedAt: number;
}

export interface LibraryNote {
  id: LibraryId;
  connectionId: string;
  title: string;
  body: string;
  /** Optional user-assigned tag used to group items in the tree. */
  tag?: string;
  createdAt: number;
  updatedAt: number;
}

export type NoteSpool = 'note' | 'anote' | 'storynote' | 'oocn' | 'qnote' | 'history' | 'news' | 'changes';

export interface UserNote {
  id: LibraryId;
  connectionId: string;

  spool: NoteSpool;

  /** what the UI calls “title”, but maps to `{spool} subject ...` */
  subject: string;

  /** free text editor body */
  body: string;

  /** Saved recipients for the "to" line — stored verbatim, reused on re-scribe. */
  recipients?: string[];

  /** Optional user-assigned tag used to group items within a spool. */
  tag?: string;

  /** for convenience / future search */
  createdAt: number;
  updatedAt: number;
}

export interface LibraryBookPage {
  page: number; // 1-based
  body: string;
}

export interface LibraryBook {
  id: LibraryId;
  connectionId: string;

  /** in-game title you want the book to have */
  title: string;

  /** keyword to reference the book BEFORE changing title */
  keyword: string;

  /** keyword to reference the book AFTER changing title */
  keywordAfterTitle: string;

  /** Optional user-assigned tag used to group items in the tree. */
  tag?: string;

  /** only defined pages exist here; missing pages are allowed */
  pages: LibraryBookPage[];

  createdAt: number;
  updatedAt: number;
}

// ── Editor stats / warnings ───────────────────────────────────────────────────
// Ported verbatim from dsl-client/features/book-editor/book-types.ts — no shared
// package exists across these repos, so this is a deliberate copy, not an import.

export interface LineStats {
  lineCount: number;
  currentLineIndex: number;
  currentLineLength: number;
  totalChars: number;
}

export type WarnLevel = 'ok' | 'warn' | 'over';

export interface LineWarnings {
  lineCountLevel: WarnLevel;
  charLengthLevel: WarnLevel;
}

export const SOFT_LINE_LIMIT = 60;
export const HARD_LINE_LIMIT = 70;
export const SOFT_CHAR_LIMIT = 80;
export const HARD_CHAR_LIMIT = 100;

export function getLineStats(body: string, cursorPos: number): LineStats {
  const lines = body.split('\n');
  const lineCount = lines.length;
  const textBeforeCursor = body.slice(0, cursorPos);
  const currentLineIndex = textBeforeCursor.split('\n').length - 1;
  const currentLineLength = lines[currentLineIndex]?.length ?? 0;
  return { lineCount, currentLineIndex, currentLineLength, totalChars: body.length };
}

export function getWarnings(stats: LineStats): LineWarnings {
  let lineCountLevel: WarnLevel = 'ok';
  if (stats.lineCount > HARD_LINE_LIMIT) lineCountLevel = 'over';
  else if (stats.lineCount > SOFT_LINE_LIMIT) lineCountLevel = 'warn';

  let charLengthLevel: WarnLevel = 'ok';
  if (stats.currentLineLength > HARD_CHAR_LIMIT) charLengthLevel = 'over';
  else if (stats.currentLineLength > SOFT_CHAR_LIMIT) charLengthLevel = 'warn';

  return { lineCountLevel, charLengthLevel };
}
