import type { PluginEvent, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { DispatchEvent, ListenEvent } from '../../event-emitter/event-dispatcher';
import { createWorldTimeAndIdentityPlugin, timeStringToPeriod } from './world-time-and-identity.plugin';

// game:tick/game:character-login/shatteredarchive:raw-data are called
// directly — plugin.onEvent(api, evt) the same way pluginHost actually does
// for ROUTED_WINDOW_EVENTS, no api.onEvent mock needed for those (see the
// comment in the source on why game:tick specifically can't be onEnable-
// registered). onAlias, similarly, is called directly (pluginHost.
// tryExecuteAlias's contract). onEnable is different: it registers
// shatteredarchive:command-sent itself (NOT a ROUTED_WINDOW_EVENTS member),
// so api.onEvent below is a real wrapper over the event dispatcher — tests
// that exercise that path call plugin.onEnable!(api) and DispatchEvent.
const commandListeners = new Map<string, () => void>();
const api = {
  connectionId: 'test',
  pluginId: 'world-time-and-identity',
  onEvent: (name: string, handler: (payload: unknown) => void) => {
    commandListeners.get(name)?.();
    const dispose = ListenEvent<any>(name, handler, { key: `world-time-and-identity.test::${name}` });
    commandListeners.set(name, dispose);
    return () => {
      dispose();
      if (commandListeners.get(name) === dispose) commandListeners.delete(name);
    };
  },
} as unknown as PluginRuntimeApi;

const tick = (time: string): PluginEvent => ({ name: 'game:tick', payload: { time } });
const rawData = (rawText: string): PluginEvent => ({ name: 'shatteredarchive:raw-data', payload: { rawText } });
const commandSent = (text: string) => DispatchEvent('shatteredarchive:command-sent', { text });
// The score-sheet scan is armed only by the player's own `sc`/`score` input —
// every test below that expects a scan to run must arm it first.
const armScore = (plugin: ReturnType<typeof createWorldTimeAndIdentityPlugin>) => plugin.onAlias!(api, 'sc');

// Exact two-line layout produced by this game's `score`/`sc` command (real
// corpus, carried over from userScriptRuntime.scoreIdentity.test.ts).
const SCORE_SHEET_BLOCK = [
  'Score for Talarien, the multifaceted gemstone',
  'Created: Fri Jun 12 22:33:32 2026',
  "You are a Great Wyrm, and if you get any older, you'll die.",
  '----------------------------------------------------------------------------',
  'LEVEL: 42          Race : Topaz dragon      Played: 3887 hours',
  'YEARS: 211         Class: Dragon            Log In: Tue Sep 15 14:37:22 2026',
  "SEX  : Female   Reclass@: Not Reclassed    ",
].join('\n');

// Real capture, GameLog-DSL_2026-09-26 (today): the player quit "OldChar"
// (level 51 Human Shukenja) and logged into a second character, "NewChar",
// within the SAME connection — but GMCP happened to be disabled at that
// moment, so login_data never fired for NewChar anywhere in the session, even
// after GMCP was re-enabled later via `gmc` (confirmed: 0 occurrences of
// login_data after that point in the whole file). `sc` a few minutes later
// is the only evidence the client ever gets that it's now NewChar.
const NEW_CHAR_SCORE_SHEET = [
  'Score for NewChar Surname, Strength of -=Raije=-',
  'Created: Wed Jul  2 19:25:53 2008',
  '----------------------------------------------------------------------------',
  'LEVEL: 1           Race : Yinn             Played: 170 hours',
  'YEARS: 21           Class: Thief             Log In: Sat Sep 26 10:08:12 2026',
  'SEX  : Male     Reclass@: Not Reclassed    ',
  'STR  : 051(051)                                    Items: 5    (max 107  )',
  'INT  : 049(049)                                   Weight: 12   (max 455    )',
  'WIS  : 040(040)',
  'DEX  : 061(061)    Align: Lawful Evil       ',
  "CON  : 049(049)    Pos'n: Standing             NoFollow ( )    AutoAssist( )",
  '                   Wimpy: 0                    Can Loot ( )    AutoExit  (X)',
  'BANK : 0         QPoints: 63                   NoSummon ( )    AutoGold  (X)',
  'GOLD : 0         Silver: 0                     NoLink   ( )    AutoLoot  (X)',
  'PRACT: 5         Hitpoints: 20   of   20        NoCancel ( )    AutoSac   (X)',
  'TRAIN: 6              Mana: 100  of   100       NoFly    ( )    AutoSplit ( )',
  'XP   : 1000000         Move: 100  of   100      Sounds   ( )',
  'XP To Level: 1000000  ',
].join('\n');

describe('world-time-and-identity plugin — score-sheet arming (onAlias + onEnable/command-sent)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    delete (window as any).__SA_IDENTITY__;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('never consumes the command, armed or not', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    expect(plugin.onAlias!(api, 'sc')).toBeUndefined();
    expect(plugin.onAlias!(api, 'look')).toBeUndefined();
  });

  it.each(['sc', 'score', 'SCORE', 'Sc', '  sc  '])('arms on %j', (input) => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onAlias!(api, input);
    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));

    expect((window as any).__SA_IDENTITY__?.raceName).toBe('Topaz dragon');
  });

  it.each(['scoreboard', 'sco', 'sc score', 'worth'])('does NOT arm on unrelated input %j', (input) => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onAlias!(api, input);
    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));

    expect((window as any).__SA_IDENTITY__).toBeUndefined();
  });

  it('a raw-data chunk with no prior sc/score input is never scanned, however score-shaped it looks', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));

    expect((window as any).__SA_IDENTITY__).toBeUndefined();
  });

  it('also arms on a PLUGIN-initiated shatteredarchive:command-sent, not just onAlias', () => {
    // api.sendCommand() (e.g. level-progress.plugin.ts's "Check score"
    // action) goes straight to the websocket and never touches onAlias —
    // this is the path that lets a plugin-initiated `score` still get
    // captured, with no onAlias call in this test at all.
    const plugin = createWorldTimeAndIdentityPlugin();
    const cleanup = plugin.onEnable!(api) as () => void;

    commandSent('score');
    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));

    expect((window as any).__SA_IDENTITY__?.raceName).toBe('Topaz dragon');
    cleanup();
  });

  it('does NOT arm on an unrelated shatteredarchive:command-sent', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    const cleanup = plugin.onEnable!(api) as () => void;

    commandSent('worth');
    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));

    expect((window as any).__SA_IDENTITY__).toBeUndefined();
    cleanup();
  });

  it("onEnable's cleanup disarms — a command-sent after disable does not arm", () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    const cleanup = plugin.onEnable!(api) as () => void;
    cleanup();

    commandSent('score');
    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));

    expect((window as any).__SA_IDENTITY__).toBeUndefined();
  });

  it('is one-shot: a second score sheet in the same armed window is not scanned', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    armScore(plugin);
    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));
    const firstSnapshot = { ...(window as any).__SA_IDENTITY__ };

    // Still "armed" as far as a naive reading of 20s goes, but the FIRST
    // score-sheet chunk already satisfied and disarmed it.
    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK.replace('Topaz dragon', 'Silver dragon')));

    expect((window as any).__SA_IDENTITY__).toEqual(firstSnapshot);
  });

  it('expires after the arm window: a score sheet arriving late is not scanned', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    armScore(plugin);
    jest.advanceTimersByTime(20_000);

    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));

    expect((window as any).__SA_IDENTITY__).toBeUndefined();
  });

  it('a later sc/score input re-arms after expiry', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    armScore(plugin);
    jest.advanceTimersByTime(20_000);
    armScore(plugin);

    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));

    expect((window as any).__SA_IDENTITY__?.raceName).toBe('Topaz dragon');
  });
});

describe('world-time-and-identity plugin — score-sheet identity scan', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    delete (window as any).__SA_IDENTITY__;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('extracts race and class from a full score sheet block', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    armScore(plugin);
    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));

    const snapshot = (window as any).__SA_IDENTITY__;
    expect(snapshot.raceName).toBe('Topaz dragon');
    expect(snapshot.className).toBe('Dragon');
  });

  it('extracts race alone when only that line has arrived yet', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    armScore(plugin);
    plugin.onEvent!(api, rawData('LEVEL: 42          Race : Topaz dragon      Played: 3887 hours'));

    const snapshot = (window as any).__SA_IDENTITY__;
    expect(snapshot.raceName).toBe('Topaz dragon');
    expect(snapshot.className).toBeUndefined();
  });

  it('preserves a previously captured field when a later event updates the other one', () => {
    // Two chunks of the SAME reply, each re-arming — a real split reply
    // wouldn't have a second sc/score in between, but this plugin doesn't
    // assume single-chunk delivery for the identity half either.
    const plugin = createWorldTimeAndIdentityPlugin();
    armScore(plugin);
    plugin.onEvent!(api, rawData('LEVEL: 42          Race : Topaz dragon      Played: 3887 hours'));
    armScore(plugin);
    plugin.onEvent!(api, rawData('YEARS: 211         Class: Dragon            Log In: Tue Sep 15 14:37:22 2026'));

    const snapshot = (window as any).__SA_IDENTITY__;
    expect(snapshot.raceName).toBe('Topaz dragon');
    expect(snapshot.className).toBe('Dragon');
  });

  it('does nothing for ordinary game output even while armed', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    armScore(plugin);
    plugin.onEvent!(api, rawData('You swing your sword at the orc.\n'));

    expect((window as any).__SA_IDENTITY__?.raceName).toBeUndefined();
    expect((window as any).__SA_IDENTITY__?.className).toBeUndefined();
  });

  it('the fast gate rejects ordinary text without the regex ever running, even while armed', () => {
    const matchSpy = jest.spyOn(String.prototype, 'match');
    const plugin = createWorldTimeAndIdentityPlugin();
    armScore(plugin);

    plugin.onEvent!(api, rawData('You swing your sword at the orc.\n'));

    expect(matchSpy).not.toHaveBeenCalled();
    matchSpy.mockRestore();
  });

  it('ignores events other than shatteredarchive:raw-data', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    armScore(plugin);
    plugin.onEvent!(api, { name: 'game:room-data', payload: { rawText: SCORE_SHEET_BLOCK } });

    expect((window as any).__SA_IDENTITY__).toBeUndefined();
  });

  it('skips re-writing identity on a later score sheet once both fields are already captured', () => {
    // XP scanning is NOT capture-once (see the score-sheet-exp describe block
    // below) — only the race/class write is skipped on a repeat score sheet.
    const plugin = createWorldTimeAndIdentityPlugin();
    armScore(plugin);
    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));
    const firstSnapshot = { ...(window as any).__SA_IDENTITY__ };

    armScore(plugin);
    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));
    expect((window as any).__SA_IDENTITY__).toEqual(firstSnapshot); // unchanged, incl. updatedAt
  });

  it('rearms the scan on game:character-login, clearing race/class but not characterName', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    armScore(plugin);
    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));
    (window as any).__SA_IDENTITY__.characterName = 'Talarien';

    plugin.onEvent!(api, { name: 'game:character-login', payload: {} });

    const afterLogin = (window as any).__SA_IDENTITY__;
    expect(afterLogin.raceName).toBeUndefined();
    expect(afterLogin.className).toBeUndefined();
    expect(afterLogin.characterName).toBe('Talarien');

    armScore(plugin);
    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));
    const afterRescan = (window as any).__SA_IDENTITY__;
    expect(afterRescan.raceName).toBe('Topaz dragon');
    expect(afterRescan.className).toBe('Dragon');
  });

  it('a login event with nothing captured yet is a no-op', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onEvent!(api, { name: 'game:character-login', payload: {} });

    expect((window as any).__SA_IDENTITY__).toBeUndefined();
  });

  it('self-heals from a missed login: a score sheet reporting a different name rearms race/class too', () => {
    // Simulates exactly the real scenario: stale identity left over from the
    // previous character (OldChar), no game:character-login ever fires
    // for the new one (NewChar) because GMCP was disabled during the switch.
    (window as any).__SA_IDENTITY__ = { characterName: 'OldChar', raceName: 'Human', className: 'Shukenja' };
    const plugin = createWorldTimeAndIdentityPlugin();

    armScore(plugin);
    plugin.onEvent!(api, rawData(NEW_CHAR_SCORE_SHEET));

    const snapshot = (window as any).__SA_IDENTITY__;
    expect(snapshot.characterName).toBe('NewChar');
    expect(snapshot.raceName).toBe('Yinn');
    expect(snapshot.className).toBe('Thief');
  });

  it('establishes identity from a score sheet alone when nothing was known at all', () => {
    const plugin = createWorldTimeAndIdentityPlugin();

    armScore(plugin);
    plugin.onEvent!(api, rawData(NEW_CHAR_SCORE_SHEET));

    const snapshot = (window as any).__SA_IDENTITY__;
    expect(snapshot.characterName).toBe('NewChar');
    expect(snapshot.raceName).toBe('Yinn');
    expect(snapshot.className).toBe('Thief');
  });

  it('does not rearm when the score sheet name matches the already-known character', () => {
    (window as any).__SA_IDENTITY__ = { characterName: 'TestChar', raceName: 'Arboren', className: 'Ranger' };
    const plugin = createWorldTimeAndIdentityPlugin();
    const before = { ...(window as any).__SA_IDENTITY__ };

    armScore(plugin);
    plugin.onEvent!(api, rawData(TEST_CHAR_SCORE_SHEET));

    // Same values, and updatedAt is untouched — proves no rearm/rewrite
    // happened, not just that the values coincidentally still match.
    expect((window as any).__SA_IDENTITY__).toEqual(before);
  });
});

// Real capture, GameLog-DSL_2023-05-08-Mon.txt: TestChar's score sheet the day
// after a reclass to Ranger — LEVEL 25, XP 25153728, XP To Level 846272
// (computeExpPerLevel(25, 25153728, 846272) === 1_000_000, cross-checked in
// level-progress.plugin.test.ts).
const TEST_CHAR_SCORE_SHEET = [
  'Score for TestChar, Amethyst breeze.',
  '----------------------------------------------------------------------------',
  'LEVEL: 25          Race : Arboren           Played: 26 hours',
  'YEARS: 18          Class: Ranger            Log In: Mon May  8 07:01:54 2023',
  'SEX  : Male     Reclass@: 51               ',
  'STR  : 074(074)  HitRoll: B:10  P:10  S:10        Items: 107   (max 121    )',
  'INT  : 050(050)  DamRoll: B:15  P:15  S:15       Weight: 622   (max 734    )',
  'WIS  : 074(074)    Armor: P:6 B:6 S:6 M:46',
  'DEX  : 050(050)    Align: True Neutral       ',
  "CON  : 080(080)    Pos'n: Standing             NoFollow ( )    AutoAssist(X)",
  '                   Wimpy: 163                  Can Loot ( )    AutoExit  (X)',
  'BANK : 0         QPoints: 52                   NoSummon (X)    AutoGold  (X)',
  'GOLD : 939        Silver: 20297                NoLink   ( )    AutoLoot  (X)',
  'PRACT: 0          Hitpoints: 992   of   992    NoCancel ( )    AutoSac   (X)',
  'TRAIN: 0               Mana: 177   of   177    NoFly    ( )    AutoSplit (X)',
  'XP   : 25153728        Move: 250   of   250    Sounds   ( )',
  'XP To Level: 846272   ',
  '                     Stance: Offensive         NoBattle ( )    NoToast   ( )',
  'Next PK loot change at: 0                      NoPkLoot ( )    NoTake    ( )',
  '                                              256 Color (X)    NoHeal    ( )',
  'Speaking: Common      Login Pkill Delay: 3   Login Keep Delay: 10',
  'Remaining Hostile Time: 1 Ticks',
  'Religion: Zandreya -=- the Goddess of Nature -=-',
  'PKill: [ Win: 0           Giants: 0          BB Wins: 0                    ]',
  'You feel great.',
  'You are very healthy.',
  '----------------------------------------------------------------------------',
  'PROFESSION: Sculpter',
  'Reclass Hours: 7',
].join('\n');

describe('world-time-and-identity plugin — score-sheet exp scan', () => {
  const listen = () => {
    const events: any[] = [];
    const off = ListenEvent<any>('shatteredarchive:score-sheet-exp', (p) => events.push(p), {
      key: 'world-time-and-identity.test::score-sheet-exp',
    });
    return { events, off };
  };

  beforeEach(() => {
    jest.useFakeTimers();
    delete (window as any).__SA_IDENTITY__;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('dispatches level/xp/xpToLevel/name from a real score sheet, self-derived — no prior identity needed', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    const { events, off } = listen();

    armScore(plugin);
    plugin.onEvent!(api, rawData(TEST_CHAR_SCORE_SHEET));

    expect(events).toEqual([{ characterName: 'TestChar', level: 25, xp: 25153728, xpToLevel: 846272 }]);
    off();
  });

  it('does nothing without a prior sc/score input, however score-shaped the text looks', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    const { events, off } = listen();

    plugin.onEvent!(api, rawData(TEST_CHAR_SCORE_SHEET));

    expect(events).toEqual([]);
    off();
  });

  it('includes the character name once identity has captured it', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    (window as any).__SA_IDENTITY__ = { characterName: 'TestChar' };
    const { events, off } = listen();

    armScore(plugin);
    plugin.onEvent!(api, rawData(TEST_CHAR_SCORE_SHEET));

    expect(events).toEqual([{ characterName: 'TestChar', level: 25, xp: 25153728, xpToLevel: 846272 }]);
    off();
  });

  it('is NOT capture-once: a later, separately-armed score sheet with fresh XP dispatches again', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    const { events, off } = listen();

    armScore(plugin);
    plugin.onEvent!(api, rawData(TEST_CHAR_SCORE_SHEET));
    armScore(plugin);
    plugin.onEvent!(api, rawData(TEST_CHAR_SCORE_SHEET.replace('XP   : 25153728', 'XP   : 25200000')));

    expect(events.map((e) => e.xp)).toEqual([25153728, 25200000]);
    off();
  });

  it('does not dispatch when XP To Level is absent (max level — nothing left to report)', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    const { events, off } = listen();

    const maxLevelSheet = TEST_CHAR_SCORE_SHEET.split('\n')
      .filter((line) => !line.startsWith('XP To Level'))
      .join('\n');
    armScore(plugin);
    plugin.onEvent!(api, rawData(maxLevelSheet));

    expect(events).toEqual([]);
    off();
  });

  it('does nothing for ordinary game output even while armed', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    const { events, off } = listen();

    armScore(plugin);
    plugin.onEvent!(api, rawData('You swing your sword at the orc.\n'));

    expect(events).toEqual([]);
    off();
  });
});

describe('world-time-and-identity plugin — game:tick world-time period', () => {
  beforeEach(() => {
    delete (window as any).__SA_WORLD_TIME__;
  });

  it('sets the period from a real tick payload', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onEvent!(api, tick('8:30am'));

    expect((window as any).__SA_WORLD_TIME__.period).toBe('Day Time');
  });

  it('updates on a later tick with a different period', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onEvent!(api, tick('8:30am'));
    plugin.onEvent!(api, tick('9:00pm'));

    expect((window as any).__SA_WORLD_TIME__.period).toBe('Night Time');
  });

  it('ignores a tick payload with no time field', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onEvent!(api, { name: 'game:tick', payload: {} });

    expect((window as any).__SA_WORLD_TIME__).toBeUndefined();
  });
});

describe('timeStringToPeriod', () => {
  // Every boundary edge, not just the happy path — sunrise 7:00am / sunset
  // 7:00pm confirmed against the real game-log corpus; Dawn/Dusk are each
  // exactly one hour before their anchor.
  it.each<[string, string]>([
    ['5:59am', 'Night Time'],
    ['6:00am', 'Dawn'],
    ['6:59am', 'Dawn'],
    ['7:00am', 'Day Time'],
    ['5:59pm', 'Day Time'],
    ['6:00pm', 'Dusk'],
    ['6:59pm', 'Dusk'],
    ['7:00pm', 'Night Time'],
    ['11:59pm', 'Night Time'],
    ['12:00am', 'Night Time'],
    ['12:00pm', 'Day Time'],
  ])('%s -> %s', (time, expected) => {
    expect(timeStringToPeriod(time)).toBe(expected);
  });

  it('returns null for an unparseable time string', () => {
    expect(timeStringToPeriod('not-a-time')).toBeNull();
    expect(timeStringToPeriod('')).toBeNull();
  });
});
