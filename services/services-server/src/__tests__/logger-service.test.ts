// services/services-server/src/__tests__/logger-service.test.ts

// Keep fs from touching disk when filePath is used
jest.mock('fs', () => {
  return {
    __esModule: true,
    default: {
      existsSync: jest.fn(() => true),
      mkdirSync: jest.fn(),
    },
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
  };
});

// Mock DailyRotateFile as a class (logger-service does `new DailyRotateFile({...})`)
jest.mock('winston-daily-rotate-file', () => {
  class DailyRotateFile {
    public opts: any;
    constructor(opts: any) {
      this.opts = opts;
    }
  }

  return {
    __esModule: true,
    default: DailyRotateFile,
  };
});

// Mock winston completely (no spyOn needed)
jest.mock('winston', () => {
  // Transport classes
  class ConsoleTransport {
    public opts: any;
    constructor(opts: any) {
      this.opts = opts;
    }
  }

  // winston.format is a callable that returns a FormatWrap,
  // where calling the wrap returns a { transform(...) } object
  function formatFactory(fn: (info: any) => any) {
    return () => ({
      transform: fn,
      options: {},
    });
  }

  // Attach helper factories used by your logger-service
  (formatFactory as any).combine = (...formats: any[]) => {
    return {
      options: {},
      transform: (info: any) => {
        // Run format pipeline; if any returns false, stop.
        let cur = info;
        for (const f of formats) {
          if (!f) continue;

          // f may be a FormatWrap factory (fn) or a concrete format object
          if (typeof f === 'function') {
            const inst = f();
            cur = inst?.transform ? inst.transform(cur) : cur;
          } else if (typeof f.transform === 'function') {
            cur = f.transform(cur);
          }

          if (cur === false) return false;
        }
        return cur;
      },
    };
  };

  (formatFactory as any).timestamp = () => ({
    options: {},
    transform: (info: any) => {
      if (!info.timestamp) info.timestamp = new Date().toISOString();
      return info;
    },
  });

  (formatFactory as any).colorize = () => ({
    options: {},
    transform: (info: any) => info,
  });

  (formatFactory as any).printf = (printer: (info: any) => string) => ({
    options: {},
    transform: (info: any) => {
      info.__printed = printer(info);
      return info;
    },
  });

  const createLogger = jest.fn();

  const winstonMock = {
    createLogger,
    transports: {
      Console: ConsoleTransport,
    },
    format: formatFactory,
  };

  return {
    __esModule: true,
    default: winstonMock,
    ...winstonMock,
  };
});

import * as winston from 'winston';
import { Logger, SohGate } from '../logger-service.js';
import { LogLevel, LoggerProps } from '@shatteredarchive/types-server';

type FakeWinstonLogger = {
  level: string;
  transports: any[];
  log: jest.Mock;
};

function asArray(v: any): any[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

describe('Logger', () => {
  let fakeLogger: FakeWinstonLogger;

  beforeEach(() => {
    fakeLogger = {
      level: LogLevel.Info,
      transports: [],
      log: jest.fn(),
    };

    (winston.createLogger as unknown as jest.Mock).mockImplementation((opts?: any) => {
      const o = opts ?? {};
      fakeLogger.level = String(o.level ?? LogLevel.Info);
      fakeLogger.transports = asArray(o.transports);
      return fakeLogger as any;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates only console transport when no filePath', () => {
    const props: LoggerProps = { level: LogLevel.Info };

    new Logger(props);

    expect(winston.createLogger).toHaveBeenCalledTimes(1);

    const opts = (winston.createLogger as unknown as jest.Mock).mock.calls[0][0];
    const transports = asArray(opts.transports);

    expect(transports).toHaveLength(1);
    expect(transports[0]).toBeInstanceOf((winston.transports as any).Console);
  });

  it('adds file transport when filePath is provided', () => {
    const props: LoggerProps = {
      level: LogLevel.Info,
      filePath: 'logs/app.log',
      maxSize: '5m',
      maxFiles: '7d',
    };

    new Logger(props);

    const opts = (winston.createLogger as unknown as jest.Mock).mock.calls[0][0];
    const transports = asArray(opts.transports);

    expect(transports).toHaveLength(2);

    expect(transports[0]).toBeInstanceOf((winston.transports as any).Console);
    expect(transports[1]?.constructor?.name).toBe('DailyRotateFile');
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

  it('updates level via setLevel', () => {
    const logger = new Logger({ level: LogLevel.Info });

    expect(fakeLogger.level).toBe(LogLevel.Info);

    logger.setLevel(LogLevel.Error);

    expect(fakeLogger.level).toBe(LogLevel.Error);
  });

  describe('SOH gate (SohGate)', () => {
    const SOH = '\u0001';
    const MINUTE = 60 * 1000;

    function makeGate(extra: Partial<ConstructorParameters<typeof SohGate>[0]> = {}) {
      const clock = { t: 1_000_000 };
      const gate = new SohGate({ enabled: true, now: () => clock.t, ...extra });
      return { gate, clock };
    }

    it('drops the SOH record, suppresses until the second SOH, then resumes', () => {
      const { gate } = makeGate();

      expect(gate.shouldDrop('x', { data: SOH })).toBe(true);
      expect(gate.shouldDrop('x', { data: 'hello' })).toBe(true);
      expect(gate.shouldDrop('x', { data: SOH })).toBe(true);
      expect(gate.shouldDrop('x', { data: 'visible' })).toBe(false);
    });

    it('only toggles for allowlisted event types when sohToggleEventTypes is set', () => {
      const { gate } = makeGate({ sohToggleEventTypes: ['allowed:type'] });

      expect(gate.shouldDrop('other:type', { data: SOH })).toBe(false);
      expect(gate.shouldDrop('allowed:type', { data: SOH })).toBe(true);
      expect(gate.shouldDrop('allowed:type', { data: 'hidden' })).toBe(true);
    });

    it('does nothing when disabled', () => {
      const { gate } = makeGate({ enabled: false });

      expect(gate.shouldDrop('x', { data: SOH })).toBe(false);
      expect(gate.shouldDrop('x', { data: 'still visible' })).toBe(false);
    });

    it('turns logging back on 5 minutes after an unpaired SOH', () => {
      const { gate, clock } = makeGate();

      expect(gate.shouldDrop('x', { data: SOH })).toBe(true);

      clock.t += 5 * MINUTE - 1;
      expect(gate.shouldDrop('x', { data: 'still hidden at 4m59.999s' })).toBe(true);

      clock.t += 1;
      expect(gate.shouldDrop('x', { data: 'visible again at 5m' })).toBe(false);
      expect(gate.shouldDrop('x', { data: 'and stays visible' })).toBe(false);
    });

    it('never lets a configured limit exceed 5 minutes, and honours a shorter one', () => {
      const long = makeGate({ maxSuppressMs: 60 * MINUTE });
      long.gate.shouldDrop('x', { data: SOH });
      long.clock.t += 5 * MINUTE;
      expect(long.gate.shouldDrop('x', { data: 'visible' })).toBe(false);

      const short = makeGate({ maxSuppressMs: 10 * 1000 });
      short.gate.shouldDrop('x', { data: SOH });
      short.clock.t += 10 * 1000;
      expect(short.gate.shouldDrop('x', { data: 'visible' })).toBe(false);

      const junk = makeGate({ maxSuppressMs: Number.NaN });
      junk.gate.shouldDrop('x', { data: SOH });
      junk.clock.t += 5 * MINUTE;
      expect(junk.gate.shouldDrop('x', { data: 'visible' })).toBe(false);
    });

    it('treats a SOH that arrives after the limit as a new opening, not a stale closing', () => {
      const { gate, clock } = makeGate();

      gate.shouldDrop('x', { data: SOH });
      clock.t += 6 * MINUTE;

      expect(gate.shouldDrop('x', { data: SOH })).toBe(true);
      expect(gate.shouldDrop('x', { data: 'hidden: the new prompt' })).toBe(true);
      expect(gate.shouldDrop('x', { data: SOH })).toBe(true);
      expect(gate.shouldDrop('x', { data: 'visible' })).toBe(false);
    });

    it('keeps each connection on its own switch', () => {
      const { gate } = makeGate();

      expect(gate.shouldDrop('x', { data: SOH }, 'sim')).toBe(true);
      expect(gate.shouldDrop('x', { data: 'sim hidden' }, 'sim')).toBe(true);

      expect(gate.shouldDrop('x', { data: 'real session text' }, 'real')).toBe(false);
      expect(gate.shouldDrop('x', { data: 'server record' })).toBe(false);

      // a SOH on the real connection does not close the simulacrum connection's prompt
      expect(gate.shouldDrop('x', { data: SOH }, 'real')).toBe(true);
      expect(gate.shouldDrop('x', { data: 'sim still hidden' }, 'sim')).toBe(true);
    });

    it('forgets a connection when it ends, so a left-open SOH cannot outlive it', () => {
      const { gate } = makeGate();

      gate.shouldDrop('x', { data: SOH }, 'c1');
      gate.endConnection('c1');

      expect(gate.shouldDrop('x', { data: 'visible' }, 'c1')).toBe(false);
    });
  });

  describe('Logger SOH wiring', () => {
    const SOH = '\u0001';

    afterEach(() => {
      jest.useRealTimers();
    });

    function sent(): string[] {
      return fakeLogger.log.mock.calls.map((c) => String(c[0].message));
    }

    it('evaluates the switch once per record and drops hidden records before winston sees them', () => {
      const logger = new Logger({ level: LogLevel.Debug, diskToggleOnSoh: true, sohToggleEventTypes: ['raw'] });

      logger.debug('raw', { data: SOH });
      logger.debug('raw', { data: 'password echo' });
      logger.debug('raw', { data: SOH });
      logger.debug('raw', { data: 'after' });

      expect(fakeLogger.log).toHaveBeenCalledTimes(1);
      expect(fakeLogger.log).toHaveBeenCalledWith({ level: 'debug', message: 'raw', payload: { data: 'after' } });
    });

    it('re-enables logging 5 minutes after an unpaired SOH', () => {
      jest.useFakeTimers({ now: new Date('2026-11-08T00:00:00Z') });
      const logger = new Logger({ level: LogLevel.Debug, diskToggleOnSoh: true });

      logger.debug('raw', { data: SOH });
      logger.debug('first', {});
      jest.setSystemTime(new Date('2026-11-08T00:04:59Z'));
      logger.debug('second', {});
      jest.setSystemTime(new Date('2026-11-08T00:05:00Z'));
      logger.debug('third', {});

      expect(sent()).toEqual(['third']);
    });

    it('does not let one connection hide another, and a closed connection starts clean', () => {
      const logger = new Logger({ level: LogLevel.Debug, diskToggleOnSoh: true });
      const sim = logger.forConnection('sim');
      const real = logger.forConnection('real');

      sim.debug('raw', { data: SOH });
      sim.debug('sim-hidden', {});
      real.debug('real-visible', {});
      logger.info('server-visible');

      expect(sent()).toEqual(['real-visible', 'server-visible']);

      logger.endConnection('sim');
      sim.info('sim-closed');

      expect(sent()).toEqual(['real-visible', 'server-visible', 'sim-closed']);
    });

    it('leaves the payload shape alone: the connection id is never written into the record', () => {
      const logger = new Logger({ level: LogLevel.Debug, diskToggleOnSoh: true });

      logger.forConnection('abc').warn('w', { a: 1 });

      expect(fakeLogger.log).toHaveBeenCalledWith({ level: 'warn', message: 'w', payload: { a: 1 } });
    });

    it('does not let a record below the configured level move the switch', () => {
      const logger = new Logger({ level: LogLevel.Info, diskToggleOnSoh: true });

      logger.debug('raw', { data: SOH }); // below the level: real winston discards it (the mock here does not)
      logger.info('visible');

      // 'visible' is not hidden: the below-level SOH never switched anything off
      expect(sent()).toEqual(['raw', 'visible']);
    });
  });
});
