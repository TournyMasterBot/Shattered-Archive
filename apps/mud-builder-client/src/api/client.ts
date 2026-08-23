import type { AreaFile, GroupEntry, LiveSnapshot, SimulateResetsResult, SkillEntry, SpellSpec } from '@shatteredarchive/merc-area';
import { DeviceCredentials, NeedsEnrollmentError } from '@shatteredarchive/sdk-client';

/** Thin fetch wrappers for mud-builder-server. All errors surface as thrown Error with the server's message. */

export interface Capabilities {
  writeEnabled: boolean;
  /** True when the server requires a bearer token for mutations (Phase 9). */
  tokenRequired?: boolean;
  mercAreaPath: string;
  /** Phase 15: server-wide "is the engine-rebuild feature on at all" — gates whether the Engine tab appears. Per-caller eligibility comes from rebuildStatus()'s canTrigger instead. */
  rebuildEnabled?: boolean;
  /**
   * BROWSER-facing auth-server origin for device enrollment. Absent = this deployment does
   * not offer device credentials, so the UI stays on manual token entry. Comes from the
   * server because the bundle ships no VITE_ build args (the edge routes relative URLs), so
   * only the server knows the deployment's public auth origin.
   */
  authPublicUrl?: string;
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

/**
 * Credentials, in two tiers.
 *
 * TIER 1 — device credentials (the everyday path). A non-extractable keypair in IndexedDB
 * signs a challenge for short-lived tokens; see @shatteredarchive/sdk-client. Nothing
 * replayable is stored, and no secret is ever displayed — which is also why enrolling is
 * safe to do while screen-sharing.
 *
 * TIER 2 — a manually pasted token (the service MASTER key, a local API key, or a
 * centrally-minted account key). Still necessary: it is the first-run bootstrap, the CI
 * path, and the way in when auth-server is unreachable. Held in MEMORY ONLY — deliberately
 * NOT localStorage, which is what previously made this app's credential readable by any
 * script on the page. Break-glass use is occasional and explicit, so re-entry after a
 * reload is the right trade for having no secret at rest.
 */
let manualToken = '';

/** The manually entered break-glass token. Memory-only; empty after any reload. */
export function getStoredToken(): string {
  return manualToken;
}

export function setStoredToken(token: string): void {
  manualToken = token;
}

/** This service's audience name — device tokens are scoped to exactly one service. */
const DEVICE_SERVICE = 'mud-builder-server';

let device: DeviceCredentials | null = null;

/**
 * Built lazily from /api/capabilities' authPublicUrl, because the browser-facing auth origin
 * is a deployment fact the server knows and the bundle does not (this app ships no VITE_
 * build args — the edge routes its relative URLs). A deployment that doesn't set it simply
 * never gets a DeviceCredentials, and the app stays on manual token entry.
 */
/**
 * Why device credentials aren't on offer. Carried as a REASON rather than a bare boolean
 * because the two "unsupported" cases are both fixable by the person looking at the screen,
 * and a silently-missing panel gives them nothing to act on.
 */
export type DeviceUnavailableReason =
  /** The deployment doesn't advertise an auth origin — nothing the user can do. */
  | 'not-offered'
  /** Page isn't a secure context, so WebCrypto is absent. Fixable: use https. */
  | 'insecure-context'
  /** No IndexedDB (private mode / blocked storage), so a key could not persist. */
  | 'no-storage'
  /** Available. */
  | null;

let deviceUnavailable: DeviceUnavailableReason = 'not-offered';

/** The hub origin, kept so a sign-in hand-off URL can be built without re-probing. */
let authOrigin: string | null = null;

/**
 * Where to send someone who needs a hub session, with a `returnTo` so they land back here.
 *
 * This is the whole of the "seamless" path: the user manages ONE login (auth.*), and the
 * builder never asks for a pasted secret — it enrolls a device key off the session that login
 * created. Null when the deployment advertises no auth origin.
 */
export function authSignInUrl(): string | null {
  if (!authOrigin) return null;
  return `${authOrigin}/?returnTo=${encodeURIComponent(window.location.href)}`;
}

export function configureDeviceCredentials(authPublicUrl: string | undefined): void {
  device = null;
  authOrigin = authPublicUrl ? authPublicUrl.replace(/\/+$/, '') : null;

  if (!authPublicUrl) {
    deviceUnavailable = 'not-offered';
    return;
  }

  /**
   * WebCrypto is exposed only in a SECURE CONTEXT, and a browser decides that from the
   * origin's SCHEME AND HOSTNAME — never from what the name resolves to. So `http://localhost`
   * is trusted while `http://build.shatteredarchive.dev` would NOT be, even with a hosts entry
   * pointing it at 127.0.0.1.
   *
   * This is NOT the normal path here: every service in this stack is reached by hostname
   * through the nginx router over https (dev included — tls-dev.conf, with an mkcert cert
   * covering *.shatteredarchive.dev), so device credentials work in dev exactly as in prod.
   * The guard exists for the off-path case of someone reaching a service over plain http,
   * where the useful thing is to say WHY rather than silently omit the panel.
   */
  if (typeof isSecureContext !== 'undefined' && !isSecureContext) {
    deviceUnavailable = 'insecure-context';
    return;
  }

  // No IndexedDB means the key cannot PERSIST, and a credential that evaporates on every
  // reload is worse than none — the user would be re-prompted to enrol forever.
  if (typeof indexedDB === 'undefined') {
    deviceUnavailable = 'no-storage';
    return;
  }

  try {
    device = new DeviceCredentials({ authBaseUrl: authPublicUrl });
    deviceUnavailable = null;
  } catch {
    // Belt-and-braces: a runtime that reports a secure context but still lacks crypto.subtle.
    deviceUnavailable = 'insecure-context';
  }
}

export function deviceUnavailableReason(): DeviceUnavailableReason {
  return deviceUnavailable;
}

export function deviceCredentialsAvailable(): boolean {
  return device !== null;
}

/**
 * Never throws. A storage read can fail for reasons that have nothing to do with the user's
 * access (blocked storage in private mode, a quota error), and letting that propagate would
 * abort the caller's whole access probe and leave the page stuck. "Can't tell" is treated as
 * "not enrolled", which degrades to manual token entry.
 */
export async function isDeviceEnrolled(): Promise<boolean> {
  if (!device) return false;
  try {
    return await device.isEnrolled();
  } catch {
    return false;
  }
}

/** Enroll this browser. Requires a live auth-server session cookie; returns the device id. */
export async function enrollDevice(label: string): Promise<string> {
  if (!device) throw new ApiError('this deployment does not offer device credentials', 400);
  return device.enroll(label);
}

/**
 * Enroll WITHOUT asking, for the case that should need no interaction at all: the user
 * already has a hub session, so the browser can bind itself silently and the page simply
 * works. Returns false when there is no session yet (or enrollment is refused), which is the
 * signal to offer the sign-in link rather than an error.
 *
 * Never throws. This runs inside the access probe, where an exception would abort the whole
 * check and leave the page stuck — the failure mode that made an earlier version report a
 * misleading "server unreachable".
 */
export async function tryEnrollDeviceSilently(label: string): Promise<boolean> {
  if (!device) return false;
  try {
    await device.enroll(label);
    return true;
  } catch {
    return false;
  }
}

export async function forgetDevice(): Promise<void> {
  await device?.reset();
}

/**
 * Device token when this browser is enrolled, else the manual break-glass token.
 *
 * A NeedsEnrollmentError is swallowed to '' on purpose: it means the enrollment is gone
 * (revoked, or invalidated by a password change, or the browser evicted the key), and the
 * right outcome is an ordinary 401 from the server that the UI already knows how to render
 * as "your access needs re-establishing" — not an unhandled rejection inside every caller.
 */
async function authToken(): Promise<string> {
  if (await isDeviceEnrolled()) {
    try {
      return await device!.getAccessToken(DEVICE_SERVICE);
    } catch (e) {
      if (!(e instanceof NeedsEnrollmentError)) throw e;
    }
  }
  return manualToken;
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
  const token = await authToken();
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
  const token = await authToken();
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
export type ServiceTier = 'owner' | 'admin' | 'manager' | 'builder' | 'trusted' | 'user';
export const SERVICE_TIERS: ServiceTier[] = ['owner', 'admin', 'manager', 'builder', 'trusted', 'user'];

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
  /** Reference/debugging info — grants are keyed by username now (2026-08-16), not this. */
  accountId: string | null;
  /** The caller's own username, for the grant form's "use it" self-fill — see RolesPage.tsx. */
  username: string | null;
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
  /** 2026-08-16: by username, not accountId — the server resolves it. See roles.ts's own note. */
  setRole: (username: string, tier: ServiceTier) =>
    request<{ grant: RoleGrant }>('/api/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, tier }),
    }),
  snippets: () => request<{ snippets: Snippet[] }>('/api/snippets'),
  saveSnippets: (snippets: Snippet[]) =>
    request<{ snippets: Snippet[] }>('/api/snippets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippets }),
    }),
};
