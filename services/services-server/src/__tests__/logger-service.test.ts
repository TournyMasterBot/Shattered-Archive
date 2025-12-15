// src/__tests__/logger-service.test.ts
import winston from 'winston';
import { Logger, createSohGateFormat } from '../logger-service.js';
import { LogLevel, LoggerProps } from '@shatteredarchive/types-server';

function runFormat(fmt: any, info: Record<string, any>): Record<string, any> | false {
  return fmt.transform({ ...info }, fmt.options);
}

describe('Logger', () => {
  let fakeLogger: any;
  let createLoggerSpy: jest.SpyInstance;

  beforeEach(() => {
    fakeLogger = {
      level: LogLevel.Info,
      transports: [] as any[],
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
    const props: LoggerProps = { level: LogLevel.Info };

    new Logger(props);

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

    new Logger(props);

    const call = createLoggerSpy.mock.calls[0][0];
    expect(call.transports).toHaveLength(2);
    expect(call.transports[0]).toBeInstanceOf(winston.transports.Console);

    const fileTransport = call.transports[1];
    expect(fileTransport).not.toBeInstanceOf(winston.transports.Console);
    expect(fileTransport.constructor?.name).toBe('DailyRotateFile');
  });

  it('forwards log calls to underlying winston logger', () => {
    const logger = new Logger({ level: LogLevel.Debug });

    logger.info('hello', { foo: 'bar' });
    logger.fatal('oh no', { code: 500 });

    expect(fakeLogger.log).toHaveBeenCalledWith({
      level: 'info',
      message: 'hello',
      payload: { foo: 'bar' },
    });

    expect(fakeLogger.log).toHaveBeenCalledWith({
      level: 'fatal',
      message: 'oh no',
      payload: { code: 500 },
    });
  });

  it('updates level via setLevel on logger (transport levels unchanged in current implementation)', () => {
    const logger = new Logger({
      level: LogLevel.Info,
      filePath: 'logs/app.log',
    });

    expect(fakeLogger.level).toBe(LogLevel.Info);

    const transportLevelsAtStart = fakeLogger.transports.map((t: any) => t.level);

    logger.setLevel(LogLevel.Error);

    expect(fakeLogger.level).toBe(LogLevel.Error);

    const transportLevelsAfter = fakeLogger.transports.map((t: any) => t.level);
    expect(transportLevelsAfter).toEqual(transportLevelsAtStart);
  });

  describe('SOH toggle behavior (unit test createSohGateFormat)', () => {
    it('drops SOH marker line, suppresses until second SOH, then resumes', () => {
      const gateFactory = createSohGateFormat({
        enabled: true,
      });

      const gate = gateFactory();

      // toggle off (dropped)
      const r1 = runFormat(gate, {
        level: 'info',
        message: 'game:remote-server:raw',
        payload: { data: '\u0001' },
      });
      expect(r1).toBe(false);

      // suppressed
      const r2 = runFormat(gate, {
        level: 'info',
        message: 'game:remote-server:raw',
        payload: { data: 'hello' },
      });
      expect(r2).toBe(false);

      // toggle on (dropped)
      const r3 = runFormat(gate, {
        level: 'info',
        message: 'game:remote-server:raw',
        payload: { data: '\u0001' },
      });
      expect(r3).toBe(false);

      // allowed again
      const r4 = runFormat(gate, {
        level: 'info',
        message: 'game:remote-server:raw',
        payload: { data: 'visible' },
      });
      expect(r4).not.toBe(false);
    });

    it('only toggles on allowlisted event types when sohToggleEventTypes is set', () => {
      const gateFactory = createSohGateFormat({
        enabled: true,
        sohToggleEventTypes: ['allowed:type'],
      });

      const gate = gateFactory();

      // SOH on non-allowlisted type should NOT toggle and should pass through
      const a1 = runFormat(gate, {
        level: 'info',
        message: 'other:type',
        payload: { data: '\u0001' },
      });
      expect(a1).not.toBe(false);

      // still enabled
      const a2 = runFormat(gate, {
        level: 'info',
        message: 'other:type',
        payload: { data: 'still visible' },
      });
      expect(a2).not.toBe(false);

      // allowlisted SOH toggles off (dropped)
      const b1 = runFormat(gate, {
        level: 'info',
        message: 'allowed:type',
        payload: { data: '\u0001' },
      });
      expect(b1).toBe(false);

      // now suppressed
      const b2 = runFormat(gate, {
        level: 'info',
        message: 'allowed:type',
        payload: { data: 'hidden' },
      });
      expect(b2).toBe(false);
    });

    it('does nothing when disabled', () => {
      const gateFactory = createSohGateFormat({
        enabled: false,
        sohToggleEventTypes: ['allowed:type'],
      });

      const gate = gateFactory();

      const r1 = runFormat(gate, {
        level: 'info',
        message: 'allowed:type',
        payload: { data: '\u0001' },
      });
      expect(r1).not.toBe(false);

      const r2 = runFormat(gate, {
        level: 'info',
        message: 'allowed:type',
        payload: { data: 'hello' },
      });
      expect(r2).not.toBe(false);
    });
  });
});
