export type LibraryId = string;

export interface LibraryNote {
  id: LibraryId;
  connectionId: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface LibraryBook {
  id: LibraryId;
  connectionId: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}
