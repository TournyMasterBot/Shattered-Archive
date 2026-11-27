import { appendFile, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LedgerFs } from '@shatteredarchive/copilot-core';
import type { WorldIo } from './world/memory.js';

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';
}

/** The ledger's file operations on the real file system. Missing files and folders read as absent; the folder is created on append. */
export const nodeLedgerFs: LedgerFs = {
  async append(file, text) {
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, text, 'utf8');
  },
  async read(file) {
    try {
      return await readFile(file, 'utf8');
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  },
  async size(file) {
    try {
      return (await stat(file)).size;
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  },
  async rename(from, to) {
    await rename(from, to);
  },
  async list(prefix) {
    const dir = path.dirname(prefix);
    const base = path.basename(prefix);
    try {
      return (await readdir(dir)).filter((name) => name.startsWith(base)).map((name) => path.join(dir, name));
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  },
};

/** The world memory's file operations: a missing file reads as absent, and a write replaces the file whole (a temporary file, then a rename). */
export const nodeWorldIo: WorldIo = {
  async readText(file) {
    try {
      return await readFile(file, 'utf8');
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  },
  async writeText(file, text) {
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    await writeFile(temp, text, 'utf8');
    await rename(temp, file);
  },
};
