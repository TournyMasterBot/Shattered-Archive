// apps/game-client/src/features/autoleveling/autoleveling-engine.lag.test.ts
//
// The server's measured ability lag is a floor under the engine's own timing (live findings 2026-11-14, item 7; L40): a fight command's reuse time, the gap
// before a failed cast is tried again, and the lag it expects a movement reply to wait behind. The engine talks to the real window event bus (jsdom).

import { AutoLevelingEngine } from './autoleveling-engine';
import { createDefaultAutoLevelConfig } from './autoleveling-defaults';
import type { AutoLevelAction, AutoLevelConfig } from './autoleveling-types';

const emit = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const rawText = (text: string) => emit('shatteredarchive:raw-data', { text, rawText: text, fromUserScript: false });

function captureSends() {
  const sent: string[] = [];
  const listener = (ev: Event) => {
    const d = (ev as CustomEvent).detail as { cmd?: unknown };
    if (d && typeof d.cmd === 'string') sent.push(d.cmd);
  };
  window.addEventListener('shatteredarchive:send-command', listener);
  return { sent, off: () => window.removeEventListener('shatteredarchive:send-command', listener) };
}

const cfg = (): AutoLevelConfig => ({ ...createDefaultAutoLevelConfig(), mode: 'auto_level', lookSettleMs: 0 });

function makeEngine(serverLag: Record<string, number>) {
  const engine = new AutoLevelingEngine({
    getConfig: cfg,
    setRunState: () => undefined,
    getServerLagMs: (cmd) => {
      const name = /^(?:cast|c)\s+'?([a-z ]+?)'?(?:\s|$)/i.exec(cmd)?.[1] ?? cmd.split(' ')[0];
      return serverLag[name.toLowerCase()] ?? null;
    },
  }) as any;
  engine.bind();
  engine.cfg = cfg();
  return engine;
}

describe('send_cooldown: the server lag is a floor (L40)', () => {
  const act = (cooldownSec: number): AutoLevelAction => ({ kind: 'send_cooldown', cmd: "cast 'frenzy' {name}", cooldownSec });

  it('a row configured with no reuse time still waits the measured lag', async () => {
    const { sent, off } = captureSends();
    const engine = makeEngine({ frenzy: 3800 });
    const now = jest.spyOn(Date, 'now');
    try {
      now.mockReturnValue(1_000_000);
      await engine.execAction(act(0), 1);
      now.mockReturnValue(1_003_000); // 3 s < 3.8 s: still cooling
      await engine.execAction(act(0), 1);
      expect(sent).toHaveLength(1);
      now.mockReturnValue(1_004_000); // 4 s: past it
      await engine.execAction(act(0), 1);
      expect(sent).toHaveLength(2);
    } finally {
      now.mockRestore();
      off();
    }
  });

  it('the largest of the configured, the learned and the server value wins', async () => {
    const { sent, off } = captureSends();
    const engine = makeEngine({ frenzy: 3800 });
    engine.learnedCooldownSec.set("cast 'frenzy' {name}", 6);
    const now = jest.spyOn(Date, 'now');
    try {
      now.mockReturnValue(1_000_000);
      await engine.execAction(act(2), 1);
      now.mockReturnValue(1_005_000); // 5 s: past the server's 3.8 and the configured 2, but not the learned 6
      await engine.execAction(act(2), 1);
      expect(sent).toHaveLength(1);
      now.mockReturnValue(1_006_500);
      await engine.execAction(act(2), 1);
      expect(sent).toHaveLength(2);

      engine.learnedCooldownSec.clear();
      now.mockReturnValue(2_000_000);
      await engine.execAction(act(9), 1); // configured 9 s beats the server's 3.8
      now.mockReturnValue(2_005_000);
      await engine.execAction(act(9), 1);
      expect(sent).toHaveLength(3);
    } finally {
      now.mockRestore();
      off();
    }
  });

  it('an ability with no server lag behaves exactly as before: only the configured and the learned time count', async () => {
    const { sent, off } = captureSends();
    const engine = makeEngine({});
    const now = jest.spyOn(Date, 'now');
    try {
      now.mockReturnValue(1_000_000);
      await engine.execAction(act(0), 1);
      await engine.execAction(act(0), 1); // 0 reuse time and no floor: a plain send
      expect(sent).toHaveLength(2);
    } finally {
      now.mockRestore();
      off();
    }
  });

  it('a measured 0 is no floor', async () => {
    const { sent, off } = captureSends();
    const engine = makeEngine({ frenzy: 0 });
    await engine.execAction(act(0), 1);
    await engine.execAction(act(0), 1);
    off();
    expect(sent).toHaveLength(2);
  });
});

describe('the retry gap and the expected lag use it too', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('a failed cast is tried again no sooner than the ability\'s lag when that is longer than the 3 s retry gap', async () => {
    const { sent, off } = captureSends();
    const engine = makeEngine({ bless: 8000 });
    engine.running = true;
    const done = engine.execAction({ kind: 'if_affect_missing', affectName: 'bless', cmd: "cast 'bless'" }, 1);
    rawText('You lost your concentration.\r\n');
    await jest.advanceTimersByTimeAsync(7500);
    expect(sent).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(700);
    expect(sent).toHaveLength(2);
    emit('game:affect-added', { n: 'bless' });
    await done;
    off();
  });

  it('a send is remembered with the server lag, so the wait for a later movement reply allows for it', async () => {
    const { off } = captureSends();
    const engine = makeEngine({ frenzy: 3800 });
    await engine.sendCommand("cast 'frenzy'");
    await engine.sendCommand('look'); // not remembered: a look does not queue the game
    await engine.sendCommand('n'); // nor does a move
    off();
    expect(engine.recentSends.map((s: { lagMs: number }) => s.lagMs)).toEqual([3800]);
  });

  it('with no server value and nothing learned it assumes the default lag', async () => {
    const { off } = captureSends();
    const engine = makeEngine({});
    await engine.sendCommand("cast 'mystery'");
    off();
    expect(engine.recentSends.map((s: { lagMs: number }) => s.lagMs)).toEqual([1000]);
  });
});
