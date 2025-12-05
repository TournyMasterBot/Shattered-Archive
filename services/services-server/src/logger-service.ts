import { ILogger, LoggerProps, LogLevel } from '@shatteredarchive/types-server';
import path from 'path';
import winston from 'winston';
import 'winston-daily-rotate-file';

export class Logger implements ILogger {
  private level: LogLevel;
  private logger: winston.Logger;

  constructor(props: LoggerProps) {
    this.level = props.level;

    let transports: winston.transport[] = [];

    // Console transport
    transports.push(
      new winston.transports.Console({
        level: props.level,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf((info) => {
            const { timestamp, level, message, ...rest } = info;
            const hasMeta = Object.keys(rest).length > 0;
            const metaPart = hasMeta ? ` ${JSON.stringify(rest)}` : '';
            return `[${timestamp}] ${level}: ${message}${metaPart}`;
          }),
        ),
      }),
    );

    // Rotating file transport (optional)
    if (props.filePath) {
      const dir = path.dirname(props.filePath);
      const base = path.basename(props.filePath, path.extname(props.filePath) || '.log');
      const ext = path.extname(props.filePath) || '.log';

      transports.push(
        new winston.transports.DailyRotateFile({
          dirname: dir,
          filename: `${base}-%DATE%${ext}`, // split by day
          datePattern: 'YYYY-MM-DD',
          maxSize: props.maxSize ?? '10m',
          maxFiles: props.maxFiles ?? '14d',
          level: props.level,
        }),
      );
    }

    // ---- EXTENSION HOOK FOR CLOUD LOGGING (AZURE / AWS) ----
    if (props.extendTransports) {
      transports = props.extendTransports(transports, props);
    }
    // --------------------------------------------------------

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
    this.logger.transports.forEach((t) => {
      t.level = level;
    });
  }

  debug(message: string, meta?: unknown): void {
    meta ? this.logger.debug(message, meta) : this.logger.debug(message);
  }

  info(message: string, meta?: unknown): void {
    meta ? this.logger.info(message, meta) : this.logger.info(message);
  }

  warn(message: string, meta?: unknown): void {
    meta ? this.logger.warn(message, meta) : this.logger.warn(message);
  }

  error(message: string, meta?: unknown): void {
    meta ? this.logger.error(message, meta) : this.logger.error(message);
  }

  fatal(message: string, meta?: unknown): void {
    meta ? this.logger.log('fatal', message, meta) : this.logger.log('fatal', message);
  }
}
