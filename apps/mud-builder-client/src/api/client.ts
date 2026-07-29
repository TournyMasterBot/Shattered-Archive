import type { AreaFile, GroupEntry, LiveSnapshot, SimulateResetsResult, SkillEntry, SpellSpec } from '@shatteredarchive/merc-area';

/** Thin fetch wrappers for mud-builder-server. All errors surface as thrown Error with the server's message. */

export interface Capabilities {
  writeEnabled: boolean;
  /** True when the server requires a bearer token for mutations (Phase 9). */
  tokenRequired?: boolean;
  mercAreaPath: string;
  /** Phase 15: server-wide "is the engine-rebuild feature on at all" — gates whether the Engine tab appears. Per-caller eligibility comes from rebuildStatus()'s canTrigger instead. */
  rebuildEnabled?: boolean;
}

/** Error carrying the HTTP status so the UI can tell 401 (bad token) from 403 (not master). */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const TOKEN_KEY = 'mb-token';
let tokenFallback = '';

/** The builder token, kept in localStorage so it survives reloads. */
export function getStoredToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? tokenFallback;
  } catch {
    return tokenFallback;
  }
}

export function setStoredToken(token: string): void {
  tokenFallback = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable — the in-memory fallback covers this page's lifetime
  }
}

export interface ApiKeyInfo {
  id: string;
  label: string;
  createdAt: string;
  revokedAt?: string;
}

/** create/rotate responses — the only place a plaintext token ever appears. */
export interface IssuedToken {
  id?: string;
  label?: string;
  token: string;
  note: string;
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

/** A locally-missing vnum reference PROVEN to exist in another listed area (Phase 11). */
export interface ExternalRef {
  kind: 'mob' | 'object' | 'room';
  vnum: number;
  /** Where in the edited file the reference sits (reset/exit/shop/...). */
  where: string;
  /** Area file that defines the vnum — the navigation target. */
  file: string;
  /** Display name of the defining entity. */
  name: string;
}

export interface PresenceEntry {
  file: string;
  name: string;
  ageSeconds: number;
}

export interface PreviewResult {
  file: string;
  text: string;
  diff: LineDiff;
  /** Script summary (count/perMob/errors) — errors are always [] on 200s. */
  scripts?: { count: number; perMob: { mobVnum: number; count: number }[]; errors: string[] };
  /**
   * Vnum reference summary — errors are always [] on 200s; warnings are vnums
   * NO listed area defines (real issues); external are resolved cross-area links.
   */
  refs?: { errors: string[]; warnings: string[]; external?: ExternalRef[] };
}

/** Quarantine validation report for an uploaded .are file (Phase 10). */
export interface ImportReport {
  file: string;
  exists: boolean;
  registered: boolean;
  errors: string[];
  warnings: string[];
  /** Cross-area refs proven to exist in another listed area. */
  externalRefs?: ExternalRef[];
  normalizedText: string | null;
  summary: Record<string, number> | null;
}

export interface ImportCommitResult {
  file: string;
  imported: boolean;
  backupPath: string | null;
  lstBackupPath: string | null;
  requiresCopyover: boolean;
  note: string;
}

/** One backups/audit.log line; { raw } when the line was not valid JSON. */
export interface AuditEntry {
  ts?: string;
  method?: string;
  route?: string;
  status?: number;
  actor?: string;
  raw?: string;
}

/** Phase 15 engine-rebuild pipeline status — mirrors rebuild-store.ts's RebuildStatus. */
export interface RebuildStatus {
  phase: 'building-mercmud24' | 'recreating-mercmud24' | 'building-builder-images' | 'handing-off-to-helper' | 'complete' | 'failed';
  actor: string;
  startedAt: string;
  updatedAt: string;
  log: string[];
  error?: string;
}

export interface RebuildStatusResponse {
  status: RebuildStatus | null;
  /** Whether the CURRENT caller may trigger a rebuild — informational; the actual POST enforces it server-side. */
  canTrigger: boolean;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const message = body.error ?? `${res.status} ${res.statusText}`;
    throw new ApiError(res.status === 401 ? `${message} — set your builder token in the Access tab` : message, res.status);
  }
  return body;
}

/** Like request(), but for the one endpoint that answers text/plain (a generated C patch), not JSON. */
async function requestText(url: string, init?: RequestInit): Promise<string> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const message = body.error ?? `${res.status} ${res.statusText}`;
    throw new ApiError(res.status === 401 ? `${message} — set your builder token in the Access tab` : message, res.status);
  }
  return res.text();
}

export interface WorldAreaSummary {
  file: string;
  name?: string;
  credits?: string;
  minVnum?: number;
  maxVnum?: number;
  counts: {
    rooms: number;
    mobs: number;
    objects: number;
    resets: number;
    shops: number;
    specials: number;
    socials: number;
    scripts: number;
    helps: number;
  };
  errors: string[];
  /** Proven-undefined refs (the resolver searched every listed area) — render as INVALID. */
  warnings: string[];
  /** Resolved cross-area links — healthy references, not warnings (Phase 11). */
  external?: ExternalRef[];
  /** Entities whose world-wide spawn demand exceeds their tightest reset limit (Phase 12b). */
  limitPressure?: { kind: 'mob' | 'object'; vnum: number; name: string; demand: number; limit: number }[];
  parseError?: string;
}

export interface AreaMapExit {
  /** Door direction 0-9 (N E S W U D NE NW SE SW). */
  door: number;
  toVnum: number;
  /** Lock state 0-4 (0 = open passage; 1+ = door variants per db.c). */
  locks: number;
  /** Present when the target room lives in another listed area. */
  external?: { file: string; name: string };
}

/** A `warp <vnum>` teleport declared by a room entry script (Phase 12b). */
export interface AreaMapWarp {
  toVnum: number;
  external?: { file: string; name: string };
}

export interface AreaMapRoom {
  vnum: number;
  name: string;
  sectorType: number;
  exits: AreaMapExit[];
  /** Present only when the room has script warps. */
  warps?: AreaMapWarp[];
}

export interface AreaMapResponse {
  file: string;
  name?: string;
  minVnum?: number;
  maxVnum?: number;
  rooms: AreaMapRoom[];
}

export interface WorldMapArea {
  file: string;
  name?: string;
  minVnum?: number;
  maxVnum?: number;
  rooms: number;
  parseError?: string;
}

export interface WorldMapLink {
  from: string;
  to: string;
  count: number;
  exits: { fromVnum: number; door: number; toVnum: number; toName: string }[];
}

export interface WorldMapResponse {
  areas: WorldMapArea[];
  links: WorldMapLink[];
}

export interface LiveStateResponse {
  snapshot: LiveSnapshot;
  /** Milliseconds since the game wrote this snapshot (mtime-based). */
  ageMs: number;
}

/** Phase G: mud-builder's own delegated tier ladder — 'owner' is never HTTP-assignable. */
export type ServiceTier = 'owner' | 'admin' | 'manager' | 'trusted' | 'user';
export const SERVICE_TIERS: ServiceTier[] = ['owner', 'admin', 'manager', 'trusted', 'user'];

export interface RoleGrant {
  accountId: string;
  username: string;
  tier: ServiceTier;
  grantedBy: string;
  grantedAt: string;
}

export interface RolesMe {
  kind: 'master' | 'key' | 'account';
  localTier: ServiceTier | null;
  globalRole: string | null;
}

/** Phase G: a builder's own private Room/Mob/Object/Script template, never touching the live area files. */
export type SnippetKind = 'room' | 'mob' | 'object' | 'script';

export interface Snippet {
  id: string;
  kind: SnippetKind;
  name: string;
  data: unknown;
  createdAt: string;
  updatedAt: string;
}

export const api = {
  capabilities: () => request<Capabilities>('/api/capabilities'),
  listAreas: () => request<{ areas: AreaListEntry[] }>('/api/areas'),
  world: () => request<{ areas: WorldAreaSummary[] }>('/api/world'),
  areaMap: (file: string) => request<AreaMapResponse>(`/api/map/${encodeURIComponent(file)}`),
  worldMap: () => request<WorldMapResponse>('/api/map'),
  spawn: (file: string) => request<SimulateResetsResult>(`/api/areas/${encodeURIComponent(file)}/spawn`),
  getArea: (file: string) =>
    request<{ file: string; area: AreaFile; baseHash: string }>(`/api/areas/${encodeURIComponent(file)}`),
  preview: (file: string, area: AreaFile) =>
    request<PreviewResult>(`/api/areas/${encodeURIComponent(file)}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    }),
  save: (file: string, area: AreaFile, baseHash?: string) =>
    request<{ saved: boolean; backupPath: string | null; hash?: string }>(`/api/areas/${encodeURIComponent(file)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      // baseHash makes the save conditional: the server 409s when the disk moved
      body: JSON.stringify(baseHash === undefined ? { area } : { area, baseHash }),
    }),
  presence: () => request<{ entries: PresenceEntry[]; ttlSeconds: number }>('/api/presence'),
  presenceBeat: (file: string) =>
    request<{ ok: boolean; ttlSeconds: number; name: string }>('/api/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
    }),
  createArea: (input: { file: string; name: string; credits?: string; minVnum: number; maxVnum: number }) =>
    request<{ file: string; created: boolean; requiresCopyover: boolean; note: string }>('/api/areas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  reload: (mode: 'hot' | 'copyover', file?: string) =>
    request<{ mode: string; signalPath: string }>('/api/reload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, file }),
    }),
  skills: () =>
    request<{ skills: SkillEntry[]; source: 'overlay' | 'stock'; parseError?: string; baseHash: string | null }>(
      '/api/skills',
    ),
  saveSkills: (skills: SkillEntry[], baseHash?: string | null) =>
    request<{ saved: boolean; backupPath: string | null; warnings: string[]; note: string; hash?: string }>('/api/skills', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      // baseHash (string = overlay bytes, null = "was stock") makes the save conditional
      body: JSON.stringify(baseHash === undefined ? { skills } : { skills, baseHash }),
    }),
  deleteSkills: () => request<{ removed: boolean; note: string }>('/api/skills', { method: 'DELETE' }),
  groups: () =>
    request<{ groups: GroupEntry[]; source: 'overlay' | 'stock'; parseError?: string; baseHash: string | null }>(
      '/api/groups',
    ),
  saveGroups: (groups: GroupEntry[], baseHash?: string | null) =>
    request<{ saved: boolean; backupPath: string | null; warnings: string[]; note: string; hash?: string }>('/api/groups', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      // baseHash (string = overlay bytes, null = "was stock") makes the save conditional
      body: JSON.stringify(baseHash === undefined ? { groups } : { groups, baseHash }),
    }),
  deleteGroups: () => request<{ removed: boolean; note: string }>('/api/groups', { method: 'DELETE' }),
  codegenSpells: () => request<{ specs: SpellSpec[]; baseHash: string | null }>('/api/codegen/spells'),
  saveCodegenSpells: (specs: SpellSpec[], baseHash?: string | null) =>
    request<{ saved: boolean; warnings: string[]; hash?: string }>('/api/codegen/spells', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseHash === undefined ? { specs } : { specs, baseHash }),
    }),
  codegenPatch: (funName: string) => requestText(`/api/codegen/spells/${encodeURIComponent(funName)}/patch`),
  authKeys: () => request<{ keys: ApiKeyInfo[] }>('/api/auth/keys'),
  createKey: (label: string) =>
    request<IssuedToken>('/api/auth/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    }),
  rotateKey: (id: string) => request<IssuedToken>(`/api/auth/keys/${encodeURIComponent(id)}/rotate`, { method: 'POST' }),
  revokeKey: (id: string) => request<{ id: string; revoked: boolean }>(`/api/auth/keys/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  rotateMaster: () => request<IssuedToken>('/api/auth/rotate-master', { method: 'POST' }),
  importPreview: (file: string, text: string) =>
    request<{ report: ImportReport }>('/api/import/area/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, text }),
    }),
  importCommit: (file: string, text: string, overwrite: boolean) =>
    request<ImportCommitResult>('/api/import/area', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, text, overwrite }),
    }),
  audit: (limit?: number) => request<{ entries: AuditEntry[] }>(`/api/audit${limit ? `?limit=${limit}` : ''}`),
  rebuildStatus: () => request<RebuildStatusResponse>('/api/rebuild/status'),
  triggerRebuild: () => request<{ note: string }>('/api/rebuild', { method: 'POST' }),
  stateRefresh: () => request<{ requested: boolean; note?: string }>('/api/state/refresh', { method: 'POST' }),
  stateLive: () => request<LiveStateResponse>('/api/state/live'),
  rolesMe: () => request<RolesMe>('/api/roles/me'),
  rolesList: () => request<{ grants: RoleGrant[] }>('/api/roles'),
  setRole: (accountId: string, tier: ServiceTier, username?: string) =>
    request<{ grant: RoleGrant }>(`/api/roles/${encodeURIComponent(accountId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, username }),
    }),
  snippets: () => request<{ snippets: Snippet[] }>('/api/snippets'),
  saveSnippets: (snippets: Snippet[]) =>
    request<{ snippets: Snippet[] }>('/api/snippets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippets }),
    }),
};
