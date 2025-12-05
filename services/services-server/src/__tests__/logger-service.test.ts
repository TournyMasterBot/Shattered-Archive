// src/__tests__/logger-service.test.ts
import winston from 'winston';
import { Logger } from '../logger-service.js';
import { LogLevel, LoggerProps } from '@shatteredarchive/types-server';

describe('Logger', () => {
  let fakeLogger: any;
  let createLoggerSpy: jest.SpyInstance;

  beforeEach(() => {
    fakeLogger = {
      level: LogLevel.Info,
      transports: [] as any[],
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
    };

    createLoggerSpy = jest.spyOn(winston, 'createLogger').mockImplementation((opts: any) => {
      fakeLogger.transports = opts.transports ?? [];
      fakeLogger.level = opts.level;
      return fakeLogger;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates only console transport when no filePath', () => {
    const props: LoggerProps = {
      level: LogLevel.Info,
    };

    const logger = new Logger(props); // eslint-disable-line @typescript-eslint/no-unused-vars

    expect(createLoggerSpy).toHaveBeenCalledTimes(1);
    const call = createLoggerSpy.mock.calls[0][0];

    expect(call.transports).toHaveLength(1);
    expect(call.transports[0]).toBeInstanceOf(winston.transports.Console);
  });

  it('adds file transport when filePath is provided', () => {
    const props: LoggerProps = {
      level: LogLevel.Info,
      filePath: 'logs/app.log',
      maxSize: '5m',
      maxFiles: '7d',
    };

    const logger = new Logger(props); // eslint-disable-line @typescript-eslint/no-unused-vars

    expect(createLoggerSpy).toHaveBeenCalledTimes(1);
    const call = createLoggerSpy.mock.calls[0][0];

    expect(call.transports).toHaveLength(2);
    expect(call.transports[0]).toBeInstanceOf(winston.transports.Console);

    const fileTransport = call.transports[1];

    // We don't care about exact class type for Jest; just that it's not Console
    expect(fileTransport).not.toBeInstanceOf(winston.transports.Console);
    // Sanity check that we really used DailyRotateFile
    expect(fileTransport.constructor?.name).toBe('DailyRotateFile');
  });

  it('forwards log calls to underlying winston logger', () => {
    const logger = new Logger({
      level: LogLevel.Debug,
    });

    logger.info('hello', { foo: 'bar' });
    logger.fatal('oh no', { code: 500 });

    expect(fakeLogger.info).toHaveBeenCalledWith('hello', { foo: 'bar' });
    expect(fakeLogger.log).toHaveBeenCalledWith('fatal', 'oh no', {
      code: 500,
    });
  });

  it('updates level via setLevel on logger and transports', () => {
    const logger = new Logger({
      level: LogLevel.Info,
      filePath: 'logs/app.log',
    });

    // At construction
    expect(fakeLogger.level).toBe(LogLevel.Info);
    fakeLogger.transports.forEach((t: any) => expect(t.level).toBe(LogLevel.Info));

    logger.setLevel(LogLevel.Error);

    expect(fakeLogger.level).toBe(LogLevel.Error);
    fakeLogger.transports.forEach((t: any) => expect(t.level).toBe(LogLevel.Error));
  });
});
