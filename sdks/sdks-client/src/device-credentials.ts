/**
 * AI-ANNOTATION
 * @ai-summary Browser half of the device-bound credential scheme. Generates a
 *   NON-EXTRACTABLE ECDSA P-256 keypair, keeps it in IndexedDB, enrolls only the public
 *   half, and silently trades signatures for short-lived per-service access tokens that
 *   live in memory and are never persisted.
 * @ai-public DeviceCredentials, NeedsEnrollmentError, DeviceKeyStorage,
 *   createIndexedDbDeviceStorage, createMemoryDeviceStorage, deviceAssertionPayload
 * @ai-notes `subtle`, `storage` and `fetchImpl` are all injectable, for two reasons: jsdom
 *   (the test environment) ships neither WebCrypto nor IndexedDB, and React Native ships
 *   neither either — so the same seam that makes this testable is what will make it
 *   reusable in shatteredarchive-mobile. Nothing here ever writes a token to
 *   localStorage/sessionStorage; if you are tempted to, re-read why this scheme exists.
 */

/** Thrown when this browser has no usable enrollment and the user must sign in again. */
export class NeedsEnrollmentError extends Error {
  readonly code = 'NEEDS_ENROLLMENT';

  constructor(message = 'this device needs to be enrolled — sign in again') {
    super(message);
    this.name = 'NeedsEnrollmentError';
  }
}

export interface StoredDevice {
  /** The private half is non-extractable; only the browser's crypto layer can use it. */
  keyPair: CryptoKeyPair;
  /** null until enrollment succeeds. Not a secret. */
  deviceId: string | null;
}

export interface DeviceKeyStorage {
  load(): Promise<StoredDevice | null>;
  save(device: StoredDevice): Promise<void>;
  clear(): Promise<void>;
}

export interface DeviceCredentialsOptions {
  /** Origin of auth-server, e.g. "https://auth.shatteredarchive.dev". No trailing slash needed. */
  authBaseUrl: string;
  storage?: DeviceKeyStorage;
  subtle?: SubtleCrypto;
  fetchImpl?: typeof fetch;
  clock?: () => number;
  /**
   * Re-mint this long before actual expiry, so a token cannot lapse mid-flight between the
   * check and the server receiving it.
   */
  refreshSkewMs?: number;
}

const DB_NAME = 'sa-device-credentials';
const STORE_NAME = 'device';
const RECORD_KEY = 'current';
const DEFAULT_REFRESH_SKEW_MS = 30_000;

/**
 * The exact bytes to sign. MUST stay byte-identical to auth-server's
 * `deviceAssertionPayload` (apps/auth-server/src/routes/device.ts) — length-prefixed rather
 * than delimiter-joined, so a value containing the delimiter cannot shift the framing.
 * Any drift here silently breaks every enrolled device in the field.
 */
export function deviceAssertionPayload(deviceId: string, nonce: string, service: string): Uint8Array<ArrayBuffer> {
  const joined = [deviceId, nonce, service].map((p) => `${p.length}:${p}`).join('');
  // Narrowed to Uint8Array<ArrayBuffer> so it satisfies BufferSource at every WebCrypto call
  // site: since TS 5.7 the default is Uint8Array<ArrayBufferLike>, which BufferSource rejects
  // because it could in principle be backed by a SharedArrayBuffer. TextEncoder never is.
  return new TextEncoder().encode(joined) as Uint8Array<ArrayBuffer>;
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** In-memory storage — the seam tests and non-browser runtimes use. */
export function createMemoryDeviceStorage(): DeviceKeyStorage {
  let current: StoredDevice | null = null;
  return {
    load: async () => current,
    save: async (device) => {
      current = device;
    },
    clear: async () => {
      current = null;
    },
  };
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Default browser storage. A CryptoKey is structured-cloneable, so the NON-EXTRACTABLE
 * private key can be persisted here without its bytes ever becoming visible to JS — that
 * property is the whole reason this uses IndexedDB rather than localStorage, which can only
 * hold strings and would therefore require an extractable key.
 */
export function createIndexedDbDeviceStorage(dbName = DB_NAME): DeviceKeyStorage {
  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

  const withStore = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    try {
      const tx = db.transaction(STORE_NAME, mode);
      return await promisifyRequest(fn(tx.objectStore(STORE_NAME)));
    } finally {
      db.close();
    }
  };

  return {
    load: async () => ((await withStore('readonly', (s) => s.get(RECORD_KEY))) as StoredDevice) ?? null,
    save: async (device) => {
      await withStore('readwrite', (s) => s.put(device, RECORD_KEY) as IDBRequest<IDBValidKey>);
    },
    clear: async () => {
      await withStore('readwrite', (s) => s.delete(RECORD_KEY) as IDBRequest<undefined>);
    },
  };
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

export class DeviceCredentials {
  private readonly authBaseUrl: string;
  private readonly storage: DeviceKeyStorage;
  private readonly subtle: SubtleCrypto;
  private readonly fetchImpl: typeof fetch;
  private readonly clock: () => number;
  private readonly refreshSkewMs: number;

  /** Tokens live HERE and nowhere else — never localStorage, never sessionStorage, never disk. */
  private readonly tokens = new Map<string, CachedToken>();
  /**
   * One in-flight mint per service. Without this, a page that fires a dozen requests on load
   * would run a dozen challenge/assert round trips and burn a dozen nonces.
   */
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(options: DeviceCredentialsOptions) {
    this.authBaseUrl = options.authBaseUrl.replace(/\/+$/, '');
    this.storage = options.storage ?? createIndexedDbDeviceStorage();
    const subtle = options.subtle ?? globalThis.crypto?.subtle;
    if (!subtle) {
      throw new Error('WebCrypto is unavailable — pass options.subtle for this environment');
    }
    this.subtle = subtle;
    // Guarded rather than `globalThis.fetch.bind(...)` directly: where fetch is absent that
    // form throws a bare "Cannot read properties of undefined", which callers with a try/catch
    // then misattribute to WebCrypto being unavailable. Say which capability is missing.
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('fetch is unavailable — pass options.fetchImpl for this environment');
    }
    this.fetchImpl = fetchImpl.bind(globalThis);
    this.clock = options.clock ?? Date.now;
    this.refreshSkewMs = options.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS;
  }

  /**
   * Get-or-create the device keypair. `extractable: false` is the load-bearing argument:
   * it makes `exportKey` on the private half throw forever, so the key cannot be stolen even
   * by code running on this page. (Per the WebCrypto spec the flag governs the PRIVATE key;
   * the public half stays exportable, which is what enrollment needs.)
   */
  async ensureKeyPair(): Promise<CryptoKeyPair> {
    const existing = await this.storage.load();
    if (existing) return existing.keyPair;

    const keyPair = (await this.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    await this.storage.save({ keyPair, deviceId: null });
    return keyPair;
  }

  async getDeviceId(): Promise<string | null> {
    return (await this.storage.load())?.deviceId ?? null;
  }

  async isEnrolled(): Promise<boolean> {
    return (await this.getDeviceId()) !== null;
  }

  /**
   * Enroll this browser. Requires an authenticated session (cookie), which is deliberate:
   * enrollment must always cost a real sign-in, or a stolen token could be used to enroll a
   * fresh key and gain permanent access.
   */
  async enroll(label: string): Promise<string> {
    const keyPair = await this.ensureKeyPair();
    const publicKeyJwk = await this.subtle.exportKey('jwk', keyPair.publicKey);

    const res = await this.fetchImpl(`${this.authBaseUrl}/api/device/enroll`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKeyJwk, label }),
    });
    if (!res.ok) {
      throw new Error(`device enrollment failed (${res.status}): ${await safeErrorText(res)}`);
    }
    const { deviceId } = (await res.json()) as { deviceId: string };
    await this.storage.save({ keyPair, deviceId });
    this.tokens.clear();
    return deviceId;
  }

  /**
   * A valid access token for one service, minted silently if needed. Cached per service
   * because tokens are audience-scoped — a Builder token is refused by Kingdom Tactics.
   */
  async getAccessToken(service: string): Promise<string> {
    const cached = this.tokens.get(service);
    if (cached && cached.expiresAtMs - this.refreshSkewMs > this.clock()) return cached.token;

    const pending = this.inFlight.get(service);
    if (pending) return pending;

    const mint = this.mintToken(service).finally(() => this.inFlight.delete(service));
    this.inFlight.set(service, mint);
    return mint;
  }

  private async mintToken(service: string): Promise<string> {
    const stored = await this.storage.load();
    if (!stored?.deviceId) throw new NeedsEnrollmentError();

    const { deviceId, keyPair } = { deviceId: stored.deviceId, keyPair: stored.keyPair };

    const challengeRes = await this.fetchImpl(`${this.authBaseUrl}/api/device/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
    if (!challengeRes.ok) {
      throw new Error(`device challenge failed (${challengeRes.status}): ${await safeErrorText(challengeRes)}`);
    }
    const { nonce } = (await challengeRes.json()) as { nonce: string };

    const signature = toBase64Url(
      await this.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keyPair.privateKey,
        deviceAssertionPayload(deviceId, nonce, service),
      ),
    );

    const assertRes = await this.fetchImpl(`${this.authBaseUrl}/api/device/assert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, nonce, signature, service }),
    });

    if (!assertRes.ok) {
      const body = (await assertRes.json().catch(() => ({}))) as { code?: string; error?: string };
      // The server tells us the enrollment is gone (revoked, or killed by a password change,
      // or the browser discarded the key). Drop the stale deviceId so the next call cannot
      // loop, and surface a typed error the UI can turn into a sign-in prompt.
      if (body.code === 'DEVICE_REENROLL_REQUIRED') {
        await this.storage.save({ keyPair, deviceId: null });
        this.tokens.clear();
        throw new NeedsEnrollmentError(body.error);
      }
      throw new Error(`device assertion failed (${assertRes.status}): ${body.error ?? 'unknown error'}`);
    }

    const { token, expiresAt } = (await assertRes.json()) as { token: string; expiresAt: string };
    this.tokens.set(service, { token, expiresAtMs: Date.parse(expiresAt) });
    return token;
  }

  /**
   * fetch with a device token attached. Retries ONCE on a 401 with a freshly minted token —
   * covers the ordinary race where a token expired between mint and arrival. A second 401 is
   * a real refusal and is returned as-is rather than looped on.
   */
  async authedFetch(service: string, input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const send = async (token: string): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return this.fetchImpl(input, { ...init, headers });
    };

    const first = await send(await this.getAccessToken(service));
    if (first.status !== 401) return first;

    this.tokens.delete(service);
    return send(await this.getAccessToken(service));
  }

  /** Forget this device entirely — used on sign-out. The server-side record is revoked separately. */
  async reset(): Promise<void> {
    this.tokens.clear();
    this.inFlight.clear();
    await this.storage.clear();
  }
}

async function safeErrorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}
