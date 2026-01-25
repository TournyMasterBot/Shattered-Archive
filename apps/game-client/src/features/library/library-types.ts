// apps\game-client\src\features\library\library-types.ts
export type LibraryId = string;

export interface LibraryNote {
  id: LibraryId;
  connectionId: string;
  title: string;
  body: string;
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

  /** only defined pages exist here; missing pages are allowed */
  pages: LibraryBookPage[];

  createdAt: number;
  updatedAt: number;
}
