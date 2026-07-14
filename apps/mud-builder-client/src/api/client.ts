import type { AreaFile } from '@shatteredarchive/merc-area';

/** Thin fetch wrappers for mud-builder-server. All errors surface as thrown Error with the server's message. */

export interface Capabilities {
  writeEnabled: boolean;
  mercAreaPath: string;
}

export interface AreaListEntry {
  file: string;
  name?: string;
  credits?: string;
  minVnum?: number;
  maxVnum?: number;
  error?: string;
}

export interface LineDiff {
  identical: boolean;
  start: number;
  removed: string[];
  added: string[];
}

export interface PreviewResult {
  file: string;
  text: string;
  diff: LineDiff;
  /** Script summary (count/perMob/errors) — errors are always [] on 200s. */
  scripts?: { count: number; perMob: { mobVnum: number; count: number }[]; errors: string[] };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return body;
}

export const api = {
  capabilities: () => request<Capabilities>('/api/capabilities'),
  listAreas: () => request<{ areas: AreaListEntry[] }>('/api/areas'),
  getArea: (file: string) => request<{ file: string; area: AreaFile }>(`/api/areas/${encodeURIComponent(file)}`),
  preview: (file: string, area: AreaFile) =>
    request<PreviewResult>(`/api/areas/${encodeURIComponent(file)}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    }),
  save: (file: string, area: AreaFile) =>
    request<{ saved: boolean; backupPath: string | null }>(`/api/areas/${encodeURIComponent(file)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    }),
  reload: (mode: 'hot' | 'copyover', file?: string) =>
    request<{ mode: string; signalPath: string }>('/api/reload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, file }),
    }),
};
