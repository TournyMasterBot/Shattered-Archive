// services/services-server/src/logger-service.ts
import path from 'path';
import fs from 'fs';
import winston from 'winston';
import 'winston-daily-rotate-file';

import { ILogger, LoggerProps, LogLevel } from '@shatteredarchive/types-server';

type ExtendedLoggerProps = LoggerProps & {
  // Per-transport levels (optional)
  consoleLevel?: LogLevel;
  fileLevel?: LogLevel;

  // Raw (text) file transport (optional)
  filePath?: string;

  // JSONL disk logger (optional)
  diskJsonEnabled?: boolean;
  diskJsonLevel?: LogLevel;
  diskJsonPath?: string;

  // If true, partition logs into <baseDir>/<YYYY>/<MM>/<DD>/
  datePartitioned?: boolean;

  // NOTE: winston-daily-rotate-file may still create audit metadata files;
  // there is no guaranteed "off" switch across versions.
  disableAuditFile?: boolean;

  // Toggle logging when SOH (\u0001) is seen in payload
  // (This gates ALL transports: console + file + jsonl.)
  diskToggleOnSoh?: boolean;

  // Optional: only SOH lines on these event types toggle logging
  // (recommended: ['game:remote-server:raw', 'game:client:input'])
  sohToggleEventTypes?: string[];
};

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
  const base = path.basename(filePath); // keep file name as-is
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
    const e = err as Error;
    return JSON.stringify({
      type: 'logger:stringify-failed',
      timestamp: new Date().toISOString(),
      payload: { error: e?.message ?? 'unknown error' },
    });
  }
}

// Detect SOH in common payload shapes: string | Buffer | {data/text: string|Buffer}
function containsSoh(payload: unknown): boolean {
  const SOH = '\u0001';

  if (payload === undefined || payload === null) return false;

  if (typeof payload === 'string') return payload.includes(SOH);
  if (Buffer.isBuffer(payload)) return payload.includes(0x01);

  if (typeof payload === 'object') {
    const anyObj = payload as any;

    const d = anyObj?.data;
    if (typeof d === 'string' && d.includes(SOH)) return true;
    if (Buffer.isBuffer(d) && d.includes(0x01)) return true;

    const t = anyObj?.text;
    if (typeof t === 'string' && t.includes(SOH)) return true;
    if (Buffer.isBuffer(t) && t.includes(0x01)) return true;
  }

  return false;
}

export class Logger implements ILogger {
  private level: LogLevel;
  private logger: winston.Logger;

  // Gate state — shared across ALL event types and ALL transports
  private loggingEnabled = true;

  constructor(props: ExtendedLoggerProps) {
    this.level = props.level;

    const transports: winston.transport[] = [];
    const sohTypes = props.sohToggleEventTypes?.length ? new Set(props.sohToggleEventTypes) : undefined;

    /**
     * SOH Gate (global):
     * - If a line contains SOH and (optionally) eventType is allowlisted => toggle loggingEnabled and DROP that SOH line.
     * - If loggingEnabled is false => DROP ALL logs (regardless of eventType / transport).
     */
    const sohGate = winston.format((info) => {
      if (!props.diskToggleOnSoh) return info;

      const eventType = String(info.message ?? '');
      const payload = (info as any).payload;

      const canToggle = !sohTypes || sohTypes.has(eventType);
      if (canToggle && containsSoh(payload)) {
        this.loggingEnabled = !this.loggingEnabled;
        return false; // always drop the SOH “toggle marker” line itself
      }

      if (!this.loggingEnabled) return false;

      return info;
    });

    // ------------------------
    // Console transport (GATED)
    // ------------------------
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
            const payload = (info as any).payload;
            const hasPayload = payload !== undefined;
            const payloadPart = hasPayload ? ` ${safeJsonStringify(toJsonSafe(payload))}` : '';
            return `[${(info as any).timestamp}] ${String(info.level)}: ${type}${payloadPart}`;
          }),
        ),
      }),
    );

    // ------------------------
    // Rotating raw file transport (optional, GATED)
    // ------------------------
    if (props.filePath) {
      const resolved = resolvePartitionedPath(props.filePath, props.datePartitioned);
      const dir = path.dirname(resolved);
      ensureDirSync(dir);

      const base = path.basename(resolved, path.extname(resolved) || '.log');
      const ext = path.extname(resolved) || '.log';

      const fileLevel = props.fileLevel ?? props.level;

      transports.push(
        new (winston.transports as any).DailyRotateFile({
          dirname: dir,
          filename: `${base}-%DATE%${ext}`,
          datePattern: 'YYYY-MM-DD',
          maxSize: props.maxSize ?? undefined,
          maxFiles: props.maxFiles ?? undefined, // undefined = keep forever
          level: fileLevel,
          // NOTE: no reliable "disable audit file" across versions; leaving undefined uses library defaults
          auditFile: undefined,
          format: winston.format.combine(
            sohGate(),
            winston.format.timestamp(),
            winston.format.printf((info) => {
              const type = String(info.message ?? '');
              const payload = (info as any).payload;
              const hasPayload = payload !== undefined;
              const payloadPart = hasPayload ? ` ${safeJsonStringify(toJsonSafe(payload))}` : '';
              return `[${(info as any).timestamp}] ${String(info.level)}: ${type}${payloadPart}`;
            }),
          ),
        }),
      );
    }

    // ------------------------
    // Disk JSONL transport (optional, GATED)
    // ------------------------
    if (props.diskJsonEnabled && props.diskJsonPath) {
      const resolved = resolvePartitionedPath(props.diskJsonPath, props.datePartitioned);
      const dir = path.dirname(resolved);
      ensureDirSync(dir);

      const base = path.basename(resolved, path.extname(resolved) || '.jsonl');
      const ext = path.extname(resolved) || '.jsonl';

      const diskJsonLevel = props.diskJsonLevel ?? props.level;

      transports.push(
        new (winston.transports as any).DailyRotateFile({
          dirname: dir,
          filename: `${base}-%DATE%${ext}`,
          datePattern: 'YYYY-MM-DD',
          maxSize: props.maxSize ?? undefined,
          maxFiles: props.maxFiles ?? undefined, // undefined = keep forever
          level: diskJsonLevel,
          auditFile: undefined,
          format: winston.format.combine(
            sohGate(),
            winston.format.timestamp(),
            winston.format.printf((info) => {
              const type = String(info.message ?? '');
              const payloadRaw = (info as any).payload;
              const payload = toJsonSafe(payloadRaw);

              const subtype =
                payloadRaw &&
                typeof payloadRaw === 'object' &&
                typeof (payloadRaw as any).type === 'string' &&
                (payloadRaw as any).type
                  ? String((payloadRaw as any).type)
                  : '';

              return safeJsonStringify({
                type,
                subtype,
                level: String(info.level ?? ''),
                timestamp: String((info as any).timestamp ?? new Date().toISOString()),
                payload,
              });
            }),
          ),
        }),
      );
    }

    // ---- EXTENSION HOOK FOR CLOUD LOGGING (AZURE / AWS) ----
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
