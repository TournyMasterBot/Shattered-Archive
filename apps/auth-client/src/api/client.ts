/** Thin fetch wrappers for auth-server. Every call is same-origin cookie auth (credentials: 'include') — auth-client never reads or stores the session token itself. */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface AccountSummary {
  id: string;
  username: string;
  mustChangePassword: boolean;
  emailOnFile: boolean;
  emailVerified: boolean;
  /** A2: hub-global tier ('user' default) — drives Admin-section visibility client-side; the API enforces regardless. */
  globalRole?: string;
}

export interface AdminUserRow {
  id: string;
  username: string;
  globalRole: string;
  createdAt: string;
  mustChangePassword: boolean;
  emailOnFile: boolean;
  emailVerified: boolean;
  counts: Record<string, number>;
  manageable: boolean;
}

export interface AdminUsersPage {
  users: AdminUserRow[];
  total: number;
  assignableTiers: string[];
}

export interface AdminService {
  serviceName: string;
  activeKeys: number;
  redirectUris: string[];
}

export interface TempPasswordResult {
  id: string;
  username: string;
  temporaryPassword: string;
  note: string;
}

export interface ChallengePrompt {
  questionId: string;
  prompt: string;
}

export interface Challenge {
  challengeId: string;
  prompts: ChallengePrompt[];
}

export interface SignupResult {
  username: string;
  password: string;
  note: string;
}

export interface ApiKeyInfo {
  id: string;
  service: string;
  label: string;
  createdAt: string;
  expiresAt?: string | null;
  revokedAt?: string;
}

/**
 * A browser bound to this account by a device key. Nothing here is a secret: the private
 * half is non-extractable and never left the enrolling browser, so this is public metadata
 * about which browsers are bound — there is no token to show and nothing to keep safe.
 */
export interface DeviceInfo {
  id: string;
  label: string;
  /** The audience frozen at enrollment — the services this device may mint tokens for. */
  allowedServices: string[];
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
}

/** create/rotate responses — the only place a plaintext token ever appears. rotate omits service/label. */
export interface IssuedKey {
  id: string;
  token: string;
  service?: string;
  label?: string;
  expiresAt?: string | null;
  note: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: 'include' });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new ApiError(body.error ?? `${res.status} ${res.statusText}`, res.status);
  }
  return body;
}

function postJson<T>(url: string, payload?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    ...(payload !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
  });
}

export const api = {
  challenge: () => request<Challenge>('/api/auth/challenge'),
  signup: (input: { username: string; challengeId: string; answers: Record<string, string> }) =>
    postJson<SignupResult>('/api/auth/signup', input),
  login: (username: string, password: string) => postJson<AccountSummary>('/api/auth/login', { username, password }),
  logout: () => postJson<{ loggedOut: boolean }>('/api/auth/logout'),
  me: () => request<AccountSummary>('/api/auth/me'),
  forgotPassword: (username: string) => postJson<{ message: string }>('/api/auth/forgot-password', { username }),
  resetPassword: (token: string, newPassword: string) =>
    postJson<{ message: string }>('/api/auth/reset-password', { token, newPassword }),

  changePassword: (currentPassword: string, newPassword: string) =>
    postJson<{ message: string }>('/api/account/change-password', { currentPassword, newPassword }),
  requestEmail: (email: string) => postJson<{ message: string }>('/api/account/email', { email }),
  verifyEmail: (token: string) => postJson<{ message: string }>('/api/account/email/verify', { token }),
  /**
   * Is this hand-off sanctioned? Must succeed BEFORE the consent screen renders — the
   * page navigates to redirectUri on Cancel as well as Continue, so an unvalidated
   * request would make this origin an open redirect. Rejects with the same generic
   * error as ssoApprove.
   */
  ssoValidate: (service: string, redirectUri: string) =>
    request<{ ok: true }>(`/api/sso/validate?service=${encodeURIComponent(service)}&redirect_uri=${encodeURIComponent(redirectUri)}`),
  /** SSO consent (Phase A): mints the one-time code the consumer's backend exchanges. */
  ssoApprove: (service: string, redirectUri: string) => postJson<{ code: string }>('/api/sso/approve', { service, redirectUri }),

  /** A2 admin surface — every call 403s for a plain 'user' tier. */
  adminListUsers: (query: string, offset: number, limit: number) =>
    request<AdminUsersPage>(`/api/admin/users?query=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`),
  adminSetRole: (id: string, role: string) =>
    postJson<{ id: string; username: string; globalRole: string }>(`/api/admin/users/${encodeURIComponent(id)}/role`, { role }),
  adminTempPassword: (id: string) => postJson<TempPasswordResult>(`/api/admin/users/${encodeURIComponent(id)}/temp-password`),
  adminServices: () => request<{ services: AdminService[] }>('/api/admin/services'),
  rotateMaster: () => postJson<{ message: string; epoch: number }>('/api/account/rotate-master'),

  listKeys: () => request<{ keys: ApiKeyInfo[] }>('/api/keys'),
  createKey: (service: string, label: string, expiresAt: string | null) =>
    postJson<IssuedKey>('/api/keys', { service, label, expiresAt }),
  rotateKey: (id: string) => request<IssuedKey>(`/api/keys/${encodeURIComponent(id)}/rotate`, { method: 'POST' }),
  revokeKey: (id: string) =>
    request<ApiKeyInfo & { revoked: boolean }>(`/api/keys/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /**
   * Device management. Same-origin here, so the /api/device CORS allowlist (which lists the
   * CONSUMER origins that may enroll) is not involved — the hub never enrolls a device of its
   * own, it only shows and revokes the ones consumer apps bound.
   */
  // Trailing slash is deliberate, do not "tidy" it away: nginx's `location /api/device/` is a
  // prefix ending in `/` fronting a proxy_pass, so nginx answers the slashless form with a 301
  // to this one (documented behaviour, confirmed live). Requesting it directly saves a round
  // trip per load and keeps the call in the device_auth rate-limit zone rather than falling
  // through to the general /api/ one. Express matches it either way (strict routing is off).
  listDevices: () => request<{ devices: DeviceInfo[] }>('/api/device/'),
  revokeDevice: (id: string) =>
    postJson<{ deviceId: string; revoked: boolean }>(`/api/device/${encodeURIComponent(id)}/revoke`),
  revokeAllDevices: () => postJson<{ revoked: number }>('/api/device/revoke-all'),
};
