import path from 'node:path';
import { DEFAULT_STALE_SECONDS, MAX_STALE_SECONDS, MIN_STALE_SECONDS } from '@shatteredarchive/copilot-core';
import { DEFAULT_BASELINE_CONFIG, type BaselineConfig } from '@shatteredarchive/shattered-maps-core';
import { isCloudModelName, isLocalModelUrl } from './models/ollama.js';

/** Valid TCP ports stop at 65535, so the next free number after simulacrum's 65000/65001 is 65100. */
export const DEFAULT_PORT = 65100;

export interface CopilotServerConfig {
  port: number;
  /** The address to listen on. Loopback, private ranges, or 0.0.0.0 (inside a container, with no published port). */
  host: string;
  /** Private data directory (registry, ledger, world memory). Outside git. */
  dataDir: string;
  /** The game-server's jsonl log folder, mounted read-only. */
  logDir: string;
  /** The private test-character matrix (JSON), mounted read-only from the DSL repo. Without it nobody is registered. */
  matrixPath: string;
  /** Browser origins allowed to call the API. Local and dev-domain origins only. */
  allowedOrigins: string[];
  /** The log feed counts as stale after this many seconds without game text (reported by GET /state). */
  staleSeconds: number;
  model: ModelConfig;
  /** The archive's base URL for the sphere lookups (read-only public data), or undefined for no lookups. */
  archiveUrl?: string;
  /**
   * Whether the hint tiers may call the owner's LOCAL model (`hint:ai`, Ollama on the GPU) when the instant tier has nothing. Off unless `COPILOT_HINTS_LOCAL=1`:
   * a model is never started silently. The instant tier and the learned rules need no model.
   */
  hintsLocal: boolean;
  /** The Shattered-AI `spheres.json`, or undefined for the built-in table. */
  spheresPath?: string;
  /** The world memory's fixture rule (P5): what makes a thing in a room a fixture, and what demotes it. */
  worldBaseline: BaselineConfig;
}

/** `none`: no model, so only the whoisic offer is made. `fake`: the deterministic stand-in. `ollama`: a LOCAL Ollama server. */
export interface ModelConfig {
  backend: 'none' | 'fake' | 'ollama';
  ollamaUrl?: string;
  watcherModel?: string;
  agentModel?: string;
  timeoutMs: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const PRIVATE_V4 = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^127\./];

/** True for a listen address that is not reachable from the internet. */
export function isLocalListenHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  return PRIVATE_V4.some((re) => re.test(h));
}

/** True for an origin a browser may legitimately call from: localhost, a private-range host, or the dev domain. */
export function isLocalOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.origin !== origin) return false; // no path, query or trailing slash: an Origin header never has one
  const host = url.hostname;
  return host === 'localhost' || host === 'shatteredarchive.dev' || host.endsWith('.shatteredarchive.dev') || PRIVATE_V4.some((re) => re.test(host));
}

function isPlainHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

/**
 * The model settings. Models are LOCAL ONLY: `ollama` needs a local server address (`isLocalModelUrl`) and two model names, neither a
 * hosted (`cloud`) one; the timeout is 1 to 600 seconds.
 */
function loadModelConfig(env: Record<string, string | undefined>): ModelConfig {
  const backend = (env.COPILOT_MODEL_BACKEND ?? 'none').trim();
  if (backend !== 'none' && backend !== 'fake' && backend !== 'ollama') throw new ConfigError('COPILOT_MODEL_BACKEND must be none, fake or ollama');

  const timeoutMs = env.COPILOT_MODEL_TIMEOUT_MS === undefined || env.COPILOT_MODEL_TIMEOUT_MS === '' ? 60_000 : Number(env.COPILOT_MODEL_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600_000) throw new ConfigError('COPILOT_MODEL_TIMEOUT_MS must be a whole number from 1000 to 600000');
  if (backend !== 'ollama') return { backend, timeoutMs };

  const ollamaUrl = env.COPILOT_OLLAMA_URL?.trim() ?? '';
  const watcherModel = env.COPILOT_WATCHER_MODEL?.trim() ?? '';
  const agentModel = env.COPILOT_AGENT_MODEL?.trim() ?? '';
  if (!isLocalModelUrl(ollamaUrl)) throw new ConfigError('COPILOT_OLLAMA_URL must be a local model server address (models are local only)');
  if (watcherModel === '' || agentModel === '') throw new ConfigError('COPILOT_WATCHER_MODEL and COPILOT_AGENT_MODEL must both be set');
  if (isCloudModelName(watcherModel) || isCloudModelName(agentModel)) throw new ConfigError('a hosted (cloud) model is not allowed: models are local only');
  return { backend, ollamaUrl, watcherModel, agentModel, timeoutMs };
}

function wholeNumber(env: Record<string, string | undefined>, name: string, fallback: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) throw new ConfigError(`${name} must be a whole number from 1 to ${max}`);
  return value;
}

/** The fixture rule's four numbers (docs/shattered-maps/schema.md, D13). Each can be changed in the environment; none may be nonsense. */
function loadWorldBaseline(env: Record<string, string | undefined>): BaselineConfig {
  const d = DEFAULT_BASELINE_CONFIG;
  const ratioRaw = env.COPILOT_WORLD_MIN_RATIO;
  const ratio = ratioRaw === undefined || ratioRaw.trim() === '' ? d.minRatio : Number(ratioRaw);
  if (!(ratio > 0 && ratio <= 1)) throw new ConfigError('COPILOT_WORLD_MIN_RATIO must be a number above 0 and at most 1');
  return {
    minVisits: wholeNumber(env, 'COPILOT_WORLD_MIN_VISITS', d.minVisits, 1000),
    minDays: wholeNumber(env, 'COPILOT_WORLD_MIN_DAYS', d.minDays, 365),
    minRatio: ratio,
    demoteAfterMisses: wholeNumber(env, 'COPILOT_WORLD_DEMOTE_AFTER', d.demoteAfterMisses, 1000),
  };
}

/** The origins used when COPILOT_ALLOWED_ORIGINS is not set: the game client on the dev stack and on this machine. */
export const DEFAULT_ALLOWED_ORIGINS = [
  'https://game-client.shatteredarchive.dev',
  'http://game-client.shatteredarchive.dev',
  'http://localhost:30080',
];

/**
 * Read the configuration from the environment. Refuses (throws ConfigError) unless COPILOT_ENABLED is exactly "true": a production
 * deployment never sets it, so a mistakenly started copy does nothing. Also refuses a public listen address, a relative data or log
 * directory, an out-of-range port, and any allowed origin that is not local or on the dev domain (a wildcard included).
 */
export function loadConfig(env: Record<string, string | undefined>): CopilotServerConfig {
  if (env.COPILOT_ENABLED !== 'true') {
    throw new ConfigError('Copilot is local-only: set COPILOT_ENABLED=true (dev compose profile "copilot") to start it');
  }

  const port = env.COPILOT_PORT === undefined || env.COPILOT_PORT === '' ? DEFAULT_PORT : Number(env.COPILOT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError('COPILOT_PORT must be a port number from 1 to 65535');

  const host = (env.COPILOT_LISTEN_HOST ?? '0.0.0.0').trim();
  if (!isLocalListenHost(host)) throw new ConfigError('COPILOT_LISTEN_HOST must be a loopback or private address, never a public one');

  const dataDir = env.COPILOT_DATA_DIR ?? '/data';
  const logDir = env.COPILOT_LOG_DIR ?? '/logs';
  const matrixPath = env.COPILOT_MATRIX_PATH ?? '/matrix/test-character-matrix.json';
  for (const [name, value] of [['COPILOT_DATA_DIR', dataDir], ['COPILOT_LOG_DIR', logDir], ['COPILOT_MATRIX_PATH', matrixPath]] as const) {
    if (!path.posix.isAbsolute(value) && !path.win32.isAbsolute(value)) throw new ConfigError(`${name} must be an absolute path`);
  }

  const listed = env.COPILOT_ALLOWED_ORIGINS;
  const allowedOrigins =
    listed === undefined || listed.trim() === ''
      ? [...DEFAULT_ALLOWED_ORIGINS]
      : listed
          .split(',')
          .map((o) => o.trim())
          .filter((o) => o !== '');
  for (const origin of allowedOrigins) {
    if (!isLocalOrigin(origin)) throw new ConfigError('COPILOT_ALLOWED_ORIGINS may only list local or shatteredarchive.dev origins');
  }

  const staleSeconds = env.COPILOT_STALE_SECONDS === undefined || env.COPILOT_STALE_SECONDS === '' ? DEFAULT_STALE_SECONDS : Number(env.COPILOT_STALE_SECONDS);
  if (!Number.isInteger(staleSeconds) || staleSeconds < MIN_STALE_SECONDS || staleSeconds > MAX_STALE_SECONDS) {
    throw new ConfigError(`COPILOT_STALE_SECONDS must be a whole number from ${MIN_STALE_SECONDS} to ${MAX_STALE_SECONDS}`);
  }

  const config: CopilotServerConfig = {
    port,
    host,
    dataDir,
    logDir,
    matrixPath,
    allowedOrigins,
    staleSeconds,
    model: loadModelConfig(env),
    worldBaseline: loadWorldBaseline(env),
    hintsLocal: env.COPILOT_HINTS_LOCAL?.trim() === '1',
  };

  const archive = env.COPILOT_ARCHIVE_URL?.trim();
  if (archive !== undefined && archive !== '') {
    if (!isPlainHttpUrl(archive)) throw new ConfigError('COPILOT_ARCHIVE_URL must be an http or https URL without credentials');
    config.archiveUrl = archive;
  }
  const spheres = env.COPILOT_SPHERES_PATH?.trim();
  if (spheres !== undefined && spheres !== '') {
    if (!path.posix.isAbsolute(spheres) && !path.win32.isAbsolute(spheres)) throw new ConfigError('COPILOT_SPHERES_PATH must be an absolute path');
    config.spheresPath = spheres;
  }
  return config;
}
