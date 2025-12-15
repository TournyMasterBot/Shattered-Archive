import winston from 'winston';

export enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
  Fatal = 'fatal',
}

export interface LoggerProps {
  level: LogLevel;
  /** e.g. "logs/app.log" */
  filePath?: string;
  /** e.g. "10m" */
  maxSize?: string | number;
  /** e.g. 10 */
  maxFiles?: string | number;
  /**
   * Optional hook to register additional transports (e.g. Azure, AWS).
   * This is not used today, but gives a drop-in place to add cloud
   * logging later without touching call sites.
   */
  extendTransports?: (baseTransports: winston.transport[], props: LoggerProps) => winston.transport[];
}

export interface ILogger {
  getLevel(): LogLevel;
  setLevel(level: LogLevel): void;

  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  fatal(message: string, meta?: unknown): void;
}
