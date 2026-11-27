// Auto Respell across a dropped connection: nothing waiting is cast, and nothing learned from the old session is acted on.
import type { PluginRuntimeApi } from '@shatteredarchive/types-client';
import { DispatchEvent, ListenEvent } from '../../event-emitter/event-dispatcher';
import { startSessionGate } from '../../connection/sessionGate';
import { createRespellPlugin } from './respell.plugin';

let sendCommand: jest.Mock;
let stops: Array<() => void>;

const open = () => DispatchEvent('game:remote-server:open', { host: 'mud.example', port: 4000 });
const close = () => DispatchEvent('game:remote-server:close', {});
const removed = (name: string) => DispatchEvent('game:affect-removed', { n: name });
const trueup = (...names: string[]) => DispatchEvent('game:affects-trueup', { affects: names.map((n) => ({ n })) });

function enable(config: Record<string, unknown> = {}) {
  const plugin = createRespellPlugin();
  const cfg = { ...plugin.configSchema!.defaults, spells: "sanctuary | cast 'sanctuary'\nhaste | cast 'haste'", ...config };
  const api = {
    getConfig: () => cfg,
    sendCommand,
    log: jest.fn(),
    onEvent: (name: string, handler: (payload: unknown) => void) => ListenEvent(name, handler, { key: `respell.test::${name}` }),
  } as unknown as PluginRuntimeApi;
  stops.push(plugin.onEnable!(api) as () => void);
}

beforeEach(() => {
  jest.useFakeTimers();
  sendCommand = jest.fn();
  stops = [startSessionGate()];
  close();
  open();
});

afterEach(() => {
  close();
  for (const stop of stops) stop();
  jest.useRealTimers();
});

it('recasts a dropped spell after the delay', () => {
  enable({ cooldownMs: 800 });
  removed('sanctuary');
  jest.advanceTimersByTime(799);
  expect(sendCommand).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(sendCommand).toHaveBeenCalledWith("cast 'sanctuary'");
});

it('recasts at once when the delay is zero', () => {
  enable({ cooldownMs: 0 });
  removed('haste');
  expect(sendCommand).toHaveBeenCalledWith("cast 'haste'");
});

it('does not cast a recast that was waiting when the connection dropped', () => {
  enable({ cooldownMs: 800 });
  removed('sanctuary');
  close();
  open();
  jest.advanceTimersByTime(60_000);
  expect(sendCommand).not.toHaveBeenCalled();
});

it('does not take a spell missing after a reconnect for one that just dropped', () => {
  enable({ cooldownMs: 0 });
  trueup('sanctuary', 'haste');
  close();
  open();
  trueup();
  expect(sendCommand).not.toHaveBeenCalled();

  // and it watches again from the new session's first list
  trueup('haste');
  trueup();
  expect(sendCommand).toHaveBeenCalledWith("cast 'haste'");
});

it('forgets the recast spacing of the old session', () => {
  enable({ cooldownMs: 0 });
  removed('sanctuary');
  close();
  open();
  removed('sanctuary');
  expect(sendCommand).toHaveBeenCalledTimes(2);
});

it('stops listening for the drop when it is disabled', () => {
  enable({ cooldownMs: 0 });
  stops.pop()!();
  trueup('haste');
  close();
  open();
  trueup();
  expect(sendCommand).not.toHaveBeenCalled();
});
