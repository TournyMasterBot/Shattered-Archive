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

  // ✅ For `import winston from 'winston'` in your source file
  return {
    __esModule: true,
    default: winstonMock,
    ...winstonMock,
  };
});

import * as winston from 'winston';
import { Logger, createSohGateFormat } from '../logger-service.js';
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

  describe('SOH gate (createSohGateFormat)', () => {
    function info(message: string, data: string) {
      return {
        level: 'info',
        message,
        payload: { data },
      };
    }

    it('drops SOH line, suppresses until second SOH, then resumes', () => {
      const gateFactory = createSohGateFormat({ enabled: true });
      const gate = gateFactory();

      const r1 = gate.transform(info('x', '\u0001'));
      expect(r1).toBe(false);

      const r2 = gate.transform(info('x', 'hello'));
      expect(r2).toBe(false);

      const r3 = gate.transform(info('x', '\u0001'));
      expect(r3).toBe(false);

      const r4 = gate.transform(info('x', 'visible'));
      expect(r4).not.toBe(false);
    });

    it('only toggles for allowlisted event types when sohToggleEventTypes is set', () => {
      const gateFactory = createSohGateFormat({
        enabled: true,
        sohToggleEventTypes: ['allowed:type'],
      });
      const gate = gateFactory();

      const a1 = gate.transform(info('other:type', '\u0001'));
      expect(a1).not.toBe(false);

      const b1 = gate.transform(info('allowed:type', '\u0001'));
      expect(b1).toBe(false);

      const b2 = gate.transform(info('allowed:type', 'hidden'));
      expect(b2).toBe(false);
    });

    it('does nothing when disabled', () => {
      const gateFactory = createSohGateFormat({ enabled: false });
      const gate = gateFactory();

      const r1 = gate.transform(info('x', '\u0001'));
      expect(r1).not.toBe(false);

      const r2 = gate.transform(info('x', 'still visible'));
      expect(r2).not.toBe(false);
    });
  });
});
