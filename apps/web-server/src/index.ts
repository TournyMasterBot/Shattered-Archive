// apps\web-server\src\index.ts
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import type { ServerHealth } from '@shatteredarchive/types-server';
import { getConfigFromEnv, createExpressService } from '@shatteredarchive/services-server';

/* ---------------- env loading ---------------- */

// IMPORTANT: do not crash if .env is missing; allow offline-only mode.
const baseEnvFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(baseEnvFile)) {
  dotenv.config({ path: baseEnvFile, override: true });
} else {
  console.warn(`[web-server] No base .env found at ${baseEnvFile} (continuing)`);
}

// environment-specific overrides (optional)
const env = process.env.ENVIRONMENT ?? 'dev';
const envFile = path.resolve(process.cwd(), `.env.${env}`);
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, override: true });
  console.log(`[web-server] Loaded environment overrides from ${envFile}`);
} else {
  console.warn(`[web-server] No environment override file found at ${envFile}, using base .env only`);
}

const serverPort = process.env.PORT;
if (!serverPort) {
  throw new Error('Fatal exception : environment variable PORT is not defined');
}

console.log(`[web-server] Loaded environment (env=${env})`);

// Load standardized config for this service
const webConfig = getConfigFromEnv('web-server');

// Upstream base is OPTIONAL now: offline fallback still works without it.
const SHATTEREDARCHIVE_BASE = process.env.SHATTEREDARCHIVE_BASE;
if (!SHATTEREDARCHIVE_BASE) {
  console.warn('[web-server] SHATTEREDARCHIVE_BASE is not defined. Upstream fetch disabled; offline only.');
}

/* ---------------- upstream helpers ---------------- */

function buildUpstreamUrl(p: string): string | null {
  if (!SHATTEREDARCHIVE_BASE) return null;
  const base = SHATTEREDARCHIVE_BASE.replace(/\/+$/, '');
  const pathPart = p.replace(/^\/+/, '');
  return `${base}/${pathPart}`;
}

async function fetchJsonWithTimeout(url: string, ms = 10_000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ac.signal,
    });

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return { ok: false as const, status: r.status, text };
    }

    const json = await r.json();
    return { ok: true as const, status: r.status, json };
  } catch (e: any) {
    return { ok: false as const, status: 0, text: String(e?.message ?? e ?? 'fetch failed') };
  } finally {
    clearTimeout(t);
  }
}

/* ---------------- In-memory cache (process lifetime) ---------------- */

type CacheEntry = { expiresAt: number; value: unknown };

const MAPS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const mapsCache = new Map<string, CacheEntry>();

function getCached(key: string): unknown | null {
  const entry = mapsCache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    mapsCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key: string, value: unknown, ttlMs: number) {
  mapsCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function maxAgeSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

/* ---------------- Offline fallback ----------------
   Files (source):
   - src/offline/continents/continent-names.json -> { continentNames: string[] }
   - src/offline/continents/<Continent>/areas.json -> { areaNames: string[] }
---------------------------------------------------- */
function isSafeFolderName(s: string): boolean {
  const v = String(s ?? '').trim();
  if (!v) return false;
  if (v.length > 20) return false;
  return /^[A-Za-z0-9 _-]+$/.test(v) && !v.includes('..');
}

function tryFindOfflineRoot(): string | null {
  // Prefer a location relative to THIS FILE (reliable under ts-node/esm)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const candidates = [
    path.resolve(__dirname, 'offline'), // src/offline when running src/index.ts
    path.resolve(__dirname, '../offline'), // if index ends up elsewhere
    path.resolve(process.cwd(), 'src', 'offline'),
    path.resolve(process.cwd(), 'dist', 'src', 'offline'),
    path.resolve(process.cwd(), 'offline'),
    path.resolve(process.cwd(), 'dist', 'offline'),
  ];

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
    } catch {
      // ignore
    }
  }
  return null;
}

const offlineRoot = tryFindOfflineRoot();
if (!offlineRoot) {
  console.warn('[web-server] Offline root not found. Offline fallback will be unavailable.');
} else {
  console.log(`[web-server] Offline root detected at ${offlineRoot}`);
}

function safeJsonParseFile(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

let offlineContinentNamesCache: string[] | null = null;

function loadOfflineContinentNames(): string[] | null {
  if (!offlineRoot) return null;
  if (offlineContinentNamesCache) return offlineContinentNamesCache;

  const p = path.resolve(offlineRoot, 'continents', 'continent-names.json');
  const j = safeJsonParseFile(p);
  const arr = j?.continentNames;

  if (Array.isArray(arr) && arr.every((x: any) => typeof x === 'string')) {
    offlineContinentNamesCache = arr;
    return arr;
  }
  return null;
}

function loadOfflineAreaNames(continentRaw: string): string[] | null {
  if (!offlineRoot) return null;

  const continents = loadOfflineContinentNames();
  const wanted = String(continentRaw ?? '').trim();
  if (!wanted) return null;

  // Use continentNames as canonical folder match (case-insensitive)
  const matched = continents?.find((c) => c.toLowerCase() === wanted.toLowerCase()) ?? wanted;
  if (!isSafeFolderName(matched)) return null;

  const p = path.resolve(offlineRoot, 'continents', matched, 'areas.json');
  const j = safeJsonParseFile(p);

  const arr = j?.areaNames;
  if (Array.isArray(arr) && arr.every((x: any) => typeof x === 'string')) {
    return arr;
  }

  return null;
}

/* ---------------- Optional basePath compatibility ---------------- */

function getMaybeBasePath(cfg: unknown): string {
  const c: any = cfg as any;
  const bp = c?.basePath ?? c?.base_path ?? c?.apiBasePath ?? c?.api_base_path ?? '';
  if (!bp) return '';
  if (typeof bp !== 'string') return '';
  const trimmed = bp.trim();
  if (!trimmed || trimmed === '/') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function registerGet(app: any, basePath: string, route: string, handler: (req: any, res: any) => any) {
  app.get(route, handler);
  if (basePath) {
    const full = `${basePath}${route.startsWith('/') ? route : `/${route}`}`;
    app.get(full, handler);
  }
}

/* ---------------- Service ---------------- */

const service = createExpressService(webConfig, (app) => {
  const basePath = getMaybeBasePath(webConfig);
  console.log(`[web-server] Route basePath: ${basePath || '(none)'}`);

  app.get('/', (_req, res) => {
    res.json({ message: 'Hello from web-server' });
  });

  app.get('/health', (_req, res) => {
    const health: ServerHealth = {
      status: 'ok',
      uptimeSeconds: process.uptime(),
    };
    res.json(health);
  });

  // GET /maps/continent/names -> { continentNames: string[] }
  const handleContinentNames = async (req: any, res: any) => {
    const key = req.path;
    const cached = getCached(key);
    if (cached !== null) {
      res.setHeader('X-Maps-Source', 'cache');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds(MAPS_TTL_MS)}`);
      return res.status(200).json(cached);
    }

    // upstream first (if configured)
    const upstreamUrl = buildUpstreamUrl(`maps/continent/names`);
    if (upstreamUrl) {
      const result = await fetchJsonWithTimeout(upstreamUrl, 10_000);
      if (result.ok && result.json) {
        setCached(key, result.json, MAPS_TTL_MS);
        res.setHeader('X-Maps-Source', 'upstream');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds(MAPS_TTL_MS)}`);
        return res.status(200).json(result.json);
      }
    }

    // offline fallback
    const offline = loadOfflineContinentNames();
    if (offline) {
      const payload = { continentNames: offline };
      setCached(key, payload, MAPS_TTL_MS);
      res.setHeader('X-Maps-Source', 'offline');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds(MAPS_TTL_MS)}`);
      return res.status(200).json(payload);
    }

    return res.status(502).json({
      error: 'Offline fallback unavailable (and upstream disabled or failed)',
    });
  };

  // GET /maps/continent/:continent/get-area-names -> { areaNames: string[] }
  const handleAreaNamesByContinent = async (req: any, res: any) => {
    const continent = String(req.params?.continent ?? '').trim();

    // allow spaces for "NE Ocean" etc
    if (!/^[A-Za-z0-9 _-]+$/.test(continent)) {
      return res.status(400).json({ error: 'Invalid continent' });
    }

    if (continent.length > 20) return res.status(400).json({ error: 'Invalid continent' });

    const key = req.path;
    const cached = getCached(key);
    if (cached !== null) {
      res.setHeader('X-Maps-Source', 'cache');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds(MAPS_TTL_MS)}`);
      return res.status(200).json(cached);
    }

    // upstream first (if configured)
    const upstreamUrl = buildUpstreamUrl(`maps/continent/${encodeURIComponent(continent)}/get-area-names`);
    if (upstreamUrl) {
      const result = await fetchJsonWithTimeout(upstreamUrl, 10_000);
      if (result.ok && result.json) {
        setCached(key, result.json, MAPS_TTL_MS);
        res.setHeader('X-Maps-Source', 'upstream');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds(MAPS_TTL_MS)}`);
        return res.status(200).json(result.json);
      }
    }

    // offline fallback (folder match driven by continentNames)
    const offlineAreas = loadOfflineAreaNames(continent);
    if (offlineAreas) {
      const payload = { areaNames: offlineAreas };
      setCached(key, payload, MAPS_TTL_MS);
      res.setHeader('X-Maps-Source', 'offline');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds(MAPS_TTL_MS)}`);
      return res.status(200).json(payload);
    }

    return res.status(502).json({
      error: 'Offline fallback missing for continent (and upstream disabled or failed)',
      continent,
    });
  };

  registerGet(app, basePath, '/maps/continent/names', handleContinentNames);
  registerGet(app, basePath, '/maps/continent/:continent/get-area-names', handleAreaNamesByContinent);
});

service
  .start()
  .then(() => {
    console.log(`[web-server] Listening on port ${serverPort}`);
  })
  .catch((err) => {
    console.error(`[web-server] Failed to start`, err);
    process.exit(1);
  });
