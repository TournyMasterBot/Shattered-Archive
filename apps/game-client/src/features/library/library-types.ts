export type LibraryId = string;

export interface LibraryNote {
  id: LibraryId;
  connectionId: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export type NoteSpool =
  | 'note'
  | 'anote'
  | 'storynote'
  | 'oocn'
  | 'qnote'
  | 'history'
  | 'news'
  | 'changes';

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
  title: string;
  pages: LibraryBookPage[];
  createdAt: number;
  updatedAt: number;
}
