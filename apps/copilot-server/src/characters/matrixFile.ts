import { readFile } from 'node:fs/promises';
import { loadMatrix, type TestMatrix } from '@shatteredarchive/copilot-core';

export interface MatrixLoad {
  /** Undefined when the file is missing or unusable: the registry then registers nobody (fail closed). */
  matrix: TestMatrix | undefined;
  /** Rows accepted and rows rejected (never with a name). */
  rows: number;
  rejected: number;
}

/**
 * Read the private test-character matrix. Never throws and never reports a path, a name or a parse message: a missing or unreadable
 * file, or JSON that is not an array of rows, gives `matrix: undefined`. Without the matrix a test character would be taken for a
 * real one and given a constellation codename, so the registry refuses to register anyone instead.
 */
export async function readMatrixFile(file: string, read: (path: string) => Promise<string> = (p) => readFile(p, 'utf8')): Promise<MatrixLoad> {
  const none: MatrixLoad = { matrix: undefined, rows: 0, rejected: 0 };
  try {
    const { matrix, rejected } = loadMatrix(JSON.parse(await read(file)) as unknown);
    return { matrix, rows: matrix.rows, rejected: rejected.length };
  } catch {
    return none;
  }
}
