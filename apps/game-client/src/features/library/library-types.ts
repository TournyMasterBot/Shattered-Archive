// apps/game-client/src/features/library/library-types.ts

export type LibraryId = string;

export interface LibraryNote {
  id: LibraryId;
  connectionId: string;
  title: string;
  body: string;
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

  /** Title applies to the book; pages themselves do not have titles */
  title: string;

  /** Sparse page set: gaps represent missing/torn-out pages */
  pages: LibraryBookPage[];

  createdAt: number;
  updatedAt: number;
}
