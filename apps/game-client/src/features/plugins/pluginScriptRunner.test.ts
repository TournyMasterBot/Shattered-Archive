// Bundled plugin timers exist only while the session is live.
import type { PluginBundledScript, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { DispatchEvent } from '../event-emitter/event-dispatcher';
import { startSessionGate } from '../connection/sessionGate';
import { startPluginBundledScripts } from './pluginScriptRunner';

jest.mock('../userScripts/runtime', () => ({ runUserScript: jest.fn(async () => {}) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const runUserScript = (require('../userScripts/runtime') as { runUserScript: jest.Mock }).runUserScript;

const open = () => DispatchEvent('game:remote-server:open', { host: 'mud.example', port: 4000 });
const close = () => DispatchEvent('game:remote-server:close', {});

const timer = { kind: 'timer', name: 'tick', language: 'javascript', source: '', intervalMs: 1000 } as unknown as PluginBundledScript;
const api = { sendCommand: jest.fn(), log: jest.fn(), error: jest.fn(), httpGetJson: jest.fn(), onEvent: jest.fn() } as unknown as PluginRuntimeApi;

let stopGate: () => void;
let stopBundle: (() => void) | null;

beforeEach(() => {
  jest.useFakeTimers();
  runUserScript.mockClear();
  stopGate = startSessionGate();
  stopBundle = null;
  close();
});

afterEach(() => {
  stopBundle?.();
  close();
  stopGate();
  jest.useRealTimers();
});

const start = (scripts: PluginBundledScript[] = [timer]) => {
  stopBundle = startPluginBundledScripts('test-plugin' as never, scripts, api).stop;
};

it('does not run a timer before there is a connection', () => {
  start();
  jest.advanceTimersByTime(5000);
  expect(runUserScript).not.toHaveBeenCalled();
});

it('starts a timer straight away when the session is already live', () => {
  open();
  start();
  jest.advanceTimersByTime(1000);
  expect(runUserScript).toHaveBeenCalledTimes(1);
});

it('stops at a drop and starts again with a full interval', () => {
  start();
  open();
  jest.advanceTimersByTime(1500);
  expect(runUserScript).toHaveBeenCalledTimes(1);

  close();
  jest.advanceTimersByTime(10_000);
  expect(runUserScript).toHaveBeenCalledTimes(1);

  open();
  jest.advanceTimersByTime(999);
  expect(runUserScript).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1);
  expect(runUserScript).toHaveBeenCalledTimes(2);
});

it('stays stopped after the plugin is stopped, whatever the connection does', () => {
  open();
  start();
  stopBundle?.();
  close();
  open();
  jest.advanceTimersByTime(10_000);
  expect(runUserScript).not.toHaveBeenCalled();
});

it('ignores a timer with no interval', () => {
  open();
  start([{ ...timer, intervalMs: 0 } as PluginBundledScript]);
  jest.advanceTimersByTime(10_000);
  expect(runUserScript).not.toHaveBeenCalled();
});
