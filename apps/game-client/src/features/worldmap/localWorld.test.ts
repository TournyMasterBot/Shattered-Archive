import { DispatchEvent } from '../event-emitter/event-dispatcher';
import { ADDITIONS_STORAGE_KEY, DEFAULT_HOSTS, DEFAULT_PORTS } from '../simulacrumAdmin/connectionGate';
import { SANDBOX_WORLD_ID, startLocalMapWorld } from './localWorld';
import { __resetMapWorldsForTests, activeMapWorld } from './world';

const open = (host: unknown, port: unknown): void => DispatchEvent('game:remote-server:open', { type: 'socket-opened', host, port, receivedTimestamp: 'x' });
const close = (): void => DispatchEvent('game:remote-server:close', { type: 'socket-closed', payload: {} });

describe('the Simulacrum\'s map world (local only)', () => {
  let stop: () => void;
  beforeEach(() => {
    __resetMapWorldsForTests();
    window.localStorage.clear();
    stop = startLocalMapWorld();
  });
  afterEach(() => {
    stop();
    window.localStorage.clear();
  });

  it('registers the Simulacrum\'s world under its own route and shows the DSL until the client connects to the Simulacrum', () => {
    expect(activeMapWorld().id).toBe('dsl');
    open(DEFAULT_HOSTS[1], DEFAULT_PORTS[0]);
    expect(activeMapWorld()).toEqual({ id: SANDBOX_WORLD_ID, label: 'Simulacrum', mapPrefix: '/api/world-map/sandbox' });
  });

  it('follows the connection: the Simulacrum while connected to it, the DSL for any other game and when the socket closes', () => {
    open(DEFAULT_HOSTS[0], DEFAULT_PORTS[0]);
    expect(activeMapWorld().id).toBe('sandbox');
    open('dsl-mud.org', 4000);
    expect(activeMapWorld().id).toBe('dsl');
    open(DEFAULT_HOSTS[1], DEFAULT_PORTS[0]);
    close();
    expect(activeMapWorld().id).toBe('dsl');
  });

  it('an event with no usable host or port is the DSL', () => {
    open(DEFAULT_HOSTS[1], DEFAULT_PORTS[0]);
    open(undefined, undefined);
    expect(activeMapWorld().id).toBe('dsl');
    open(DEFAULT_HOSTS[1], String(DEFAULT_PORTS[0]));
    expect(activeMapWorld().id).toBe('dsl');
  });

  it('uses the owner\'s stored additions (a local address of the Simulacrum) like Simulacrum Admin does', () => {
    open('192.168.1.50', 65001);
    expect(activeMapWorld().id).toBe('dsl');
    window.localStorage.setItem(ADDITIONS_STORAGE_KEY, JSON.stringify({ hosts: ['192.168.1.50'], ports: [] }));
    open('192.168.1.50', 65001);
    expect(activeMapWorld().id).toBe('sandbox');
  });

  it('stopping removes the listeners and goes back to the DSL', () => {
    open(DEFAULT_HOSTS[1], DEFAULT_PORTS[0]);
    stop();
    expect(activeMapWorld().id).toBe('dsl');
    open(DEFAULT_HOSTS[1], DEFAULT_PORTS[0]);
    expect(activeMapWorld().id).toBe('dsl');
    stop = startLocalMapWorld();
  });
});
