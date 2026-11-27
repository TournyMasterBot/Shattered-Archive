// The quest bot across a dropped connection: it stops as `pq stop` does, because it cannot know where the character is afterwards.
import type { PluginRuntimeApi } from '@shatteredarchive/types-client';
import { createQuestBotPlugin } from './questbot.plugin';

function setup() {
  const plugin = createQuestBotPlugin();
  const cfg: Record<string, unknown> = { ...plugin.configSchema!.defaults };
  let onClose: () => void = () => {};
  const unsubscribe = jest.fn();
  const sendCommand = jest.fn();
  const writeTerminal = jest.fn();
  const api = {
    getConfig: () => cfg,
    updateConfig: jest.fn(),
    sendCommand,
    writeTerminal,
    log: jest.fn(),
    onEvent: (name: string, handler: () => void) => {
      if (name === 'game:remote-server:close') onClose = handler;
      return unsubscribe;
    },
  } as unknown as PluginRuntimeApi;

  const cleanup = plugin.onEnable!(api) as () => void;
  const alias = (cmd: string) => plugin.onAlias!(api, cmd);
  const line = (rawText: string) => plugin.onEvent!(api, { name: 'shatteredarchive:raw-data', payload: { rawText } });
  const fighting = (is_fighting: boolean) => plugin.onEvent!(api, { name: 'game:char-data', payload: { is_fighting } });
  const lines = () => writeTerminal.mock.calls.map((c) => String(c[0]));
  const status = () => {
    alias('pq status');
    return lines().at(-1)!;
  };

  return { cleanup, unsubscribe, alias, line, fighting, lines, status, sendCommand, close: () => onClose() };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('stops a running bot and says the connection was lost', () => {
  const bot = setup();
  bot.alias('pq start');
  expect(bot.status()).toContain('running={Wtrue');

  bot.close();

  expect(bot.status()).toContain('running={Wfalse');
  expect(bot.status()).toContain('state={Widle');
  expect(bot.lines().filter((l) => l.includes('Connection lost'))).toHaveLength(1);
});

it('cancels the resume after a fight, so nothing is sent after a reconnect', () => {
  const bot = setup();
  bot.alias('pq start');
  bot.fighting(true); // combat: the bot stands down
  bot.fighting(false); // and arms its resume in 30 s
  bot.sendCommand.mockClear();

  bot.close();
  jest.advanceTimersByTime(120_000);

  expect(bot.sendCommand).not.toHaveBeenCalled();
  expect(bot.lines().filter((l) => l.includes('Connection lost'))).toHaveLength(1);
});

it('cancels a waiting quest retry, so nothing is requested after a reconnect', () => {
  const bot = setup();
  bot.alias('pq start');
  bot.line('May the gods go with you!'); // no area was captured: it will ask again in 45 s
  bot.sendCommand.mockClear();

  bot.close();
  jest.advanceTimersByTime(120_000);

  expect(bot.sendCommand).not.toHaveBeenCalled();
});

it('closes a session that finished quests, and starts the next one from zero', () => {
  const bot = setup();
  bot.alias('pq start');
  bot.line('The Taskmaster says, granting you 10 quest points, and 100 gold.');

  bot.close();
  bot.alias('pq start');
  bot.alias('pq stats');

  expect(bot.status()).toContain('running={Wtrue');
  expect(bot.lines().filter((l) => l.includes('Connection lost'))).toHaveLength(1);
});

it('says nothing when it was not doing anything', () => {
  const bot = setup();
  bot.close();
  bot.alias('pq start');
  bot.alias('pq stop');
  bot.close();
  expect(bot.lines().filter((l) => l.includes('Connection lost'))).toEqual([]);
});

it('takes the first fight of the next session as new', () => {
  const bot = setup();
  bot.alias('pq start');
  bot.fighting(true); // the session ends mid-fight
  bot.close();

  bot.alias('pq start');
  bot.fighting(true);

  expect(bot.lines().filter((l) => l.includes('Combat detected'))).toHaveLength(2);
});

it('unsubscribes when the plugin is disabled', () => {
  const bot = setup();
  bot.cleanup();
  expect(bot.unsubscribe).toHaveBeenCalledTimes(1);
});
