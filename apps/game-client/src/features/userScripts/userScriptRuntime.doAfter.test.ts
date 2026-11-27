// Delayed commands (doAfter) belong to the connection they were made in.
import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';
import { startSessionGate } from '../connection/sessionGate';
import { UserScriptRuntime } from './userScriptRuntime';

let sent: string[];
let stops: Array<() => void>;
let runtime: UserScriptRuntime;

const open = () => DispatchEvent('game:remote-server:open', { host: 'mud.example', port: 4000 });
const close = () => DispatchEvent('game:remote-server:close', {});

beforeEach(() => {
  jest.useFakeTimers();
  window.localStorage.clear();
  sent = [];
  runtime = new UserScriptRuntime({} as never);
  stops = [
    startSessionGate(),
    ListenEvent<{ cmd: string }>('shatteredarchive:send-command', (p) => sent.push(p.cmd), { key: 'doAfter.test::send' }),
  ];
  close(); // the gate is module state: every test starts down
});

afterEach(() => {
  close();
  for (const stop of stops) stop();
  jest.useRealTimers();
});

it('sends after the delay while connected', () => {
  open();
  runtime.scheduleDoAfter(1000, 'world', 'look');
  jest.advanceTimersByTime(1000);
  expect(sent).toEqual(['look']);
});

it('runs an alias-type delayed command through the aliases', () => {
  open();
  const executeAlias = jest.spyOn(runtime, 'executeAlias').mockReturnValue(false);
  runtime.scheduleDoAfter(500, 'alias', 'go');
  jest.advanceTimersByTime(500);
  expect(executeAlias).toHaveBeenCalledWith('go');
});

it('never fires a delayed command from before a drop', () => {
  open();
  runtime.scheduleDoAfter(1000, 'world', 'kill rat');
  close();
  open();
  jest.advanceTimersByTime(60_000);
  expect(sent).toEqual([]);
});

it('schedules nothing while there is no connection', () => {
  runtime.scheduleDoAfter(1000, 'world', 'look');
  open();
  jest.advanceTimersByTime(60_000);
  expect(sent).toEqual([]);
});

it('cancelDoAfterTimers cancels what is waiting and leaves later ones alone', () => {
  open();
  runtime.scheduleDoAfter(1000, 'world', 'first');
  runtime.scheduleDoAfter(2000, 'world', 'second');
  jest.advanceTimersByTime(1000);

  runtime.cancelDoAfterTimers();
  runtime.scheduleDoAfter(1000, 'world', 'third');
  jest.advanceTimersByTime(60_000);

  expect(sent).toEqual(['first', 'third']);
});
