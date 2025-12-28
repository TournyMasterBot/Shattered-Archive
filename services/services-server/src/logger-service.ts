// services/services-server/src/logger-service.ts
import path from 'path';
import fs from 'fs';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file'; // ✅ typed import

import { ILogger, LoggerProps, LogLevel } from '@shatteredarchive/types-server';

type ExtendedLoggerProps = LoggerProps & {
  consoleLevel?: LogLevel;
  fileLevel?: LogLevel;
  filePath?: string;

  diskJsonEnabled?: boolean;
  diskJsonLevel?: LogLevel;
  diskJsonPath?: string;

  datePartitioned?: boolean;
  disableAuditFile?: boolean;

  diskToggleOnSoh?: boolean;
  sohToggleEventTypes?: string[];
};

// ---- helpers to avoid `any` ----------------------------------------------

type InfoWithExtras = winston.Logform.TransformableInfo & {
  payload?: unknown;
  timestamp?: string;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function getRecordProp(obj: UnknownRecord, key: string): unknown {
  return obj[key];
}

function getInfoPayload(info: winston.Logform.TransformableInfo): unknown {
  return (info as InfoWithExtras).payload;
}

function getInfoTimestamp(info: winston.Logform.TransformableInfo): string {
  return (info as InfoWithExtras).timestamp ?? new Date().toISOString();
}

// -------------------------------------------------------------------------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function ensureDirSync(dir: string): void {
  if (!dir) return;
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
}

function resolvePartitionedPath(filePath: string, datePartitioned: boolean | undefined): string {
  if (!datePartitioned) return filePath;

  const now = new Date();
  const y = String(now.getFullYear());
  const m = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());

  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  return path.join(dir, y, m, d, base);
}

function toJsonSafe(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (Buffer.isBuffer(value)) return value.toString('utf8');

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (typeof value === 'bigint') return value.toString();

  return value;
}

function safeJsonStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch (err) {
    const e = err instanceof Error ? err : new Error('unknown error');
    return JSON.stringify({
      type: 'logger:stringify-failed',
      timestamp: new Date().toISOString(),
      payload: { error: e.message },
    });
  }
}

// Detect SOH in common payload shapes: string | Buffer | {data/text: string|Buffer}
function containsSoh(payload: unknown): boolean {
  const SOH = '\u0001';

  if (payload === undefined || payload === null) return false;

  if (typeof payload === 'string') return payload.includes(SOH);
  if (Buffer.isBuffer(payload)) return payload.includes(0x01);

  if (isRecord(payload)) {
    const d = getRecordProp(payload, 'data');
    if (typeof d === 'string' && d.includes(SOH)) return true;
    if (Buffer.isBuffer(d) && d.includes(0x01)) return true;

    const t = getRecordProp(payload, 'text');
    if (typeof t === 'string' && t.includes(SOH)) return true;
    if (Buffer.isBuffer(t) && t.includes(0x01)) return true;
  }

  return false;
}

/**
 * Exported for unit tests.
 * Returns a *format factory* (call it like `sohGate()` inside format.combine).
 *
 * Behavior:
 * - If a line contains SOH and (optionally) eventType is allowlisted => toggle and DROP that SOH line.
 * - If logging is disabled => DROP ALL logs.
 */
export function createSohGateFormat(args: {
  enabled: boolean;
  sohToggleEventTypes?: string[];
  containsSohFn?: (payload: unknown) => boolean;
  getEventType?: (info: winston.Logform.TransformableInfo) => string;
  getPayload?: (info: winston.Logform.TransformableInfo) => unknown;
}): winston.Logform.FormatWrap {
  const {
    enabled,
    sohToggleEventTypes,
    containsSohFn = containsSoh,
    getEventType = (info) => String(info.message ?? ''),
    getPayload = (info) => getInfoPayload(info), // ✅ no any
  } = args;

  const sohTypes = sohToggleEventTypes?.length ? new Set(sohToggleEventTypes) : undefined;

  let loggingEnabled = true;

  return winston.format((info) => {
    if (!enabled) return info;

    const eventType = getEventType(info);
    const payload = getPayload(info);

    const canToggle = !sohTypes || sohTypes.has(eventType);
    if (canToggle && containsSohFn(payload)) {
      loggingEnabled = !loggingEnabled;
      return false;
    }

    if (!loggingEnabled) return false;

    return info;
  });
}

export class Logger implements ILogger {
  private level: LogLevel;
  private logger: winston.Logger;

  constructor(props: ExtendedLoggerProps) {
    this.level = props.level;

    const transports: winston.transport[] = [];

    const sohGate = createSohGateFormat({
      enabled: !!props.diskToggleOnSoh,
      sohToggleEventTypes: props.sohToggleEventTypes,
    });

    // Console transport (GATED)
    const consoleLevel = props.consoleLevel ?? props.level;

    transports.push(
      new winston.transports.Console({
        level: consoleLevel,
        format: winston.format.combine(
          sohGate(),
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf((info) => {
            const type = String(info.message ?? '');
            const payload = getInfoPayload(info);
            const payloadPart = payload !== undefined ? ` ${safeJsonStringify(toJsonSafe(payload))}` : '';
            return `[${getInfoTimestamp(info)}] ${String(info.level)}: ${type}${payloadPart}`;
          }),
        ),
      }),
    );

    // Rotating raw file transport (optional, GATED)
    if (props.filePath) {
      const resolved = resolvePartitionedPath(props.filePath, props.datePartitioned);
      const dir = path.dirname(resolved);
      ensureDirSync(dir);

      const base = path.basename(resolved, path.extname(resolved) || '.log');
      const ext = path.extname(resolved) || '.log';

      const fileLevel = props.fileLevel ?? props.level;

      transports.push(
        new DailyRotateFile({
          dirname: dir,
          filename: `${base}-%DATE%${ext}`,
          datePattern: 'YYYY-MM-DD',
          maxSize: props.maxSize ?? undefined,
          maxFiles: props.maxFiles ?? undefined,
          level: fileLevel,
          auditFile: undefined,
          format: winston.format.combine(
            sohGate(),
            winston.format.timestamp(),
            winston.format.printf((info) => {
              const type = String(info.message ?? '');
              const payload = getInfoPayload(info);
              const payloadPart = payload !== undefined ? ` ${safeJsonStringify(toJsonSafe(payload))}` : '';
              return `[${getInfoTimestamp(info)}] ${String(info.level)}: ${type}${payloadPart}`;
            }),
          ),
        }),
      );
    }

    // Disk JSONL transport (optional, GATED)
    if (props.diskJsonEnabled && props.diskJsonPath) {
      const resolved = resolvePartitionedPath(props.diskJsonPath, props.datePartitioned);
      const dir = path.dirname(resolved);
      ensureDirSync(dir);

      const base = path.basename(resolved, path.extname(resolved) || '.jsonl');
      const ext = path.extname(resolved) || '.jsonl';

      const diskJsonLevel = props.diskJsonLevel ?? props.level;

      transports.push(
        new DailyRotateFile({
          dirname: dir,
          filename: `${base}-%DATE%${ext}`,
          datePattern: 'YYYY-MM-DD',
          maxSize: props.maxSize ?? undefined,
          maxFiles: props.maxFiles ?? undefined,
          level: diskJsonLevel,
          auditFile: undefined,
          format: winston.format.combine(
            sohGate(),
            winston.format.timestamp(),
            winston.format.printf((info) => {
              const type = String(info.message ?? '');
              const payloadRaw = getInfoPayload(info);
              const payload = toJsonSafe(payloadRaw);

              let subtype = '';
              if (isRecord(payloadRaw)) {
                const t = getRecordProp(payloadRaw, 'type');
                if (typeof t === 'string' && t) subtype = t;
              }

              return safeJsonStringify({
                type,
                subtype,
                level: String(info.level ?? ''),
                timestamp: getInfoTimestamp(info),
                payload,
              });
            }),
          ),
        }),
      );
    }

    if (props.extendTransports) {
      const extended = props.extendTransports(transports, props);
      transports.length = 0;
      transports.push(...extended);
    }

    this.logger = winston.createLogger({
      levels: {
        fatal: 0,
        error: 1,
        warn: 2,
        info: 3,
        debug: 4,
      },
      level: props.level,
      transports,
    });
  }

  getLevel(): LogLevel {
    return this.level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
    this.logger.level = level;
  }

  debug(message: string, meta?: unknown): void {
    this.logger.log({ level: 'debug', message, payload: meta });
  }
  info(message: string, meta?: unknown): void {
    this.logger.log({ level: 'info', message, payload: meta });
  }
  warn(message: string, meta?: unknown): void {
    this.logger.log({ level: 'warn', message, payload: meta });
  }
  error(message: string, meta?: unknown): void {
    this.logger.log({ level: 'error', message, payload: meta });
  }
  fatal(message: string, meta?: unknown): void {
    this.logger.log({ level: 'fatal', message, payload: meta });
  }
}

export default Logger;
