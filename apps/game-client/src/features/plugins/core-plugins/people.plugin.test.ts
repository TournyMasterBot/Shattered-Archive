import type { PluginRuntimeApi } from '@shatteredarchive/types-client';
import { DispatchEvent, ListenEvent } from '../../event-emitter/event-dispatcher';

// Module-level singleton state (peopleDb's `db` Map) means each test needs a
// fresh module instance — jest.resetModules() + re-require, matching
// peopleDb.test.ts's own convention. Re-requiring people.plugin pulls in a
// fresh peopleDb too, since it imports from it at module load time.
function freshPeoplePlugin() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const plugin = require('./people.plugin') as typeof import('./people.plugin');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const db = require('./peopleDb') as typeof import('./peopleDb');
  return { ...plugin, ...db };
}

const RAW = 'shatteredarchive:raw-data';
const raw = (rawText: string) => DispatchEvent(RAW, { rawText });

// Real captures, GameLog-DSL_2026-09-24 (server.log-2026-09-24.jsonl, the
// `who` reply following the player's own `who` input at 13:37:20) — each
// player arrived as its OWN separate raw-data event, not one batched chunk,
// which is exactly why the arm window can't disarm on the first match.
const CLAN_LINE = '\x1b[0m[49  Yinn  Cru] [ \x1b[0;31mBloodlust\x1b[0m ] Vyraek Atazra \x1b[0m \x1b[0m\r\n';
const KINGDOM_LINE = "\x1b[0m[25  Yinn  Shu] \x1b[1;36m(\x1b[0;36mAR\x1b[1;36m)\x1b[0m Vyar Dra'vex \x1b[0m\r\n";
const ORDINARY_LINE = 'You swing your sword at the orc.\n';

function setup(debug = false) {
  const { createPeoplePlugin, getPerson } = freshPeoplePlugin();
  const active = new Map<string, () => void>();
  const writeTerminal = jest.fn();
  const log = jest.fn();

  const api = {
    connectionId: 'test',
    pluginId: 'people',
    log,
    error: jest.fn(),
    writeTerminal,
    getConfig: () => ({ debug }),
    onEvent: (name: string, handler: (payload: unknown) => void) => {
      active.get(name)?.();
      const dispose = ListenEvent<any>(name, handler, { key: `people.test::${name}` });
      active.set(name, dispose);
      return () => {
        dispose();
        if (active.get(name) === dispose) active.delete(name);
      };
    },
  } as unknown as PluginRuntimeApi;

  const plugin = createPeoplePlugin();
  const cleanup = plugin.onEnable!(api) as () => void;

  return {
    plugin,
    api,
    getPerson,
    writeTerminal,
    log,
    arm: (input: string) => plugin.onAlias!(api, input),
    listenerCount: () => active.size,
    dispose: () => cleanup(),
  };
}

describe('people plugin — who-family arming', () => {
  let current: ReturnType<typeof setup> | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    current?.dispose();
    current = null;
    jest.useRealTimers();
  });

  const start = () => (current = setup());

  it('does not scan a who-list line without a prior who-family input', () => {
    const t = start();
    raw(CLAN_LINE);

    expect(t.getPerson('Vyraek')).toBeNull();
  });

  it.each([
    'who',
    'whoc',
    'whoc shad',
    'whok',
    'whok ve',
    'whocraft',
    'whocraft armor',
    'whois',
    'whois tib',
    'whoisd',
    'whoisic',
    'whoic',
    'whos',
    'whosi',
    'whov',
    'whoami',
  ])('arms on %j', (input) => {
    const t = start();
    t.arm(input);
    raw(CLAN_LINE);

    expect(t.getPerson('Vyraek')).not.toBeNull();
  });

  it.each(['look', 'north', 'score', 'sc', 'worth', 'somewho'])('does NOT arm on unrelated input %j', (input) => {
    const t = start();
    t.arm(input);
    raw(CLAN_LINE);

    expect(t.getPerson('Vyraek')).toBeNull();
  });

  it('never consumes a who-family command — the real command must still reach the server', () => {
    const t = start();
    expect(t.arm('who')).not.toBe(true);
    expect(t.arm('whoc shad')).not.toBe(true);
  });

  it('captures multiple separate raw-data events within one armed window, no re-arming needed', () => {
    // The real reply is many single-line events, not one batched chunk.
    const t = start();
    t.arm('who');
    raw(CLAN_LINE);
    raw(KINGDOM_LINE);

    expect(t.getPerson('Vyraek')).not.toBeNull();
    expect(t.getPerson('Vyar')).not.toBeNull();
  });

  it('does not disarm after the first match — unlike the score-sheet scan, a who reply spans many chunks', () => {
    const t = start();
    t.arm('who');
    raw(CLAN_LINE); // first chunk matches and would disarm a score-style one-shot
    raw(KINGDOM_LINE); // still captured because the window is still open

    expect(t.getPerson('Vyar')).not.toBeNull();
  });

  it('expires after the arm window: a who-list line arriving late is not scanned', () => {
    const t = start();
    t.arm('who');
    jest.advanceTimersByTime(5_000);

    raw(CLAN_LINE);
    expect(t.getPerson('Vyraek')).toBeNull();
  });

  it('a later who-family input re-arms after expiry', () => {
    const t = start();
    t.arm('who');
    jest.advanceTimersByTime(5_000);
    t.arm('whoc');

    raw(CLAN_LINE);
    expect(t.getPerson('Vyraek')).not.toBeNull();
  });

  it('a fresh who input while already armed restarts the window rather than shortening it', () => {
    const t = start();
    t.arm('who');
    jest.advanceTimersByTime(4_000);
    t.arm('who'); // restarts the 5s window
    jest.advanceTimersByTime(4_000); // 8s since the first arm, but only 4s since the restart

    raw(CLAN_LINE);
    expect(t.getPerson('Vyraek')).not.toBeNull();
  });

  it('ignores ordinary game output even while armed', () => {
    const t = start();
    t.arm('who');
    raw(ORDINARY_LINE);

    expect(t.getPerson('Vyraek')).toBeNull();
  });

  it('cleanup disarms and removes the listener — a pending window does not scan after disable', () => {
    const t = start();
    t.arm('who');
    expect(t.listenerCount()).toBe(1);

    t.dispose();
    current = null; // already disposed, don't double-dispose in afterEach
    jest.advanceTimersByTime(10_000);

    raw(CLAN_LINE);
    expect(t.getPerson('Vyraek')).toBeNull();
    expect(t.listenerCount()).toBe(0);
  });

  it('existing command-bar behavior (show info) still works alongside arming', () => {
    const t = start();
    t.arm('who');
    raw(CLAN_LINE);

    t.arm('show info vyraek');
    expect(t.writeTerminal).toHaveBeenCalledWith(expect.stringContaining('Vyraek'));
  });
});

// Lines the plugin used to drop. Real captures from the Docker game-server logs (2026-11-21 survey of
// ~26,000 who-style lines) unless marked synthetic.
describe('people plugin — who-list lines that used to be missed', () => {
  let current: ReturnType<typeof setup> | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    current?.dispose();
    current = null;
    jest.useRealTimers();
  });

  /** Arm the scan, send one line, return what the database now knows about `name`. */
  function scan(line: string, name: string) {
    current = setup();
    current.arm('who');
    raw(`${line}\r\n`);
    return current.getPerson(name);
  }

  it('records a clan member whose name follows a (WANTED) or (Hostile) flag', () => {
    expect(scan('[51  Human Skn] [ Shadow ] (WANTED) Jermichael McCord', 'Jermichael')).toMatchObject({
      org: 'Shadow',
      orgType: 'clan',
      level: 51,
      race: 'Human',
      class: 'Skn',
    });
    expect(
      scan('[51  Human Shu] [ Shadow ] (Hostile) Melchaleve Arden, Duskbinder of the Nightwardens', 'Melchaleve'),
    ).toMatchObject({
      org: 'Shadow',
    });
  });

  it('records a clan member with the prestige star, and does not take the star as part of the clan name', () => {
    expect(
      scan('[51  Human Skn] [ Shadow*] (WANTED) Telthian Schwartz,     Herald of the Umbratide', 'Telthian'),
    ).toMatchObject({
      org: 'Shadow',
      orgType: 'clan',
    });
    expect(
      scan('[51 Skn] [ Chaos* ]          Crelius      Everchosen       (Leader) (Recruiter)', 'Crelius'),
    ).toMatchObject({
      org: 'Chaos',
      class: 'Skn',
    });
  });

  it('records a kingdom member listed with a rank beside the kingdom, normalizing the long name', () => {
    expect(
      scan('[51 Kender Wit] (Queen)(Verminasia) Piknim Cracklespark, Darkfinder of the Black Moon', 'Piknim'),
    ).toMatchObject({
      org: 'VR',
      orgType: 'kingdom',
      race: 'Kender',
    });
    expect(scan('[51  Human Pal] (Emperor)(Althainia) Agapitos di Lucis', 'Agapitos')).toMatchObject({ org: 'AL' });
  });

  it('records a kingdom the game prints by its long name (synthetic line, real kingdom)', () => {
    expect(scan('[51  Human Arm] (New Thalos) Someone Else', 'Someone')).toMatchObject({
      org: 'NT',
      orgType: 'kingdom',
    });
  });

  it('records dragons and the other clans printed in parentheses as clans', () => {
    expect(scan('[51  Brass Dra] ( Dragon ) Hephaestus.', 'Hephaestus')).toMatchObject({
      org: 'Dragon',
      orgType: 'clan',
      race: 'Brass',
      class: 'Dra',
    });
    expect(scan('[51 Crystl Dra] ( Dragon ) (WANTED) Nuremaldron the Omnilescent.', 'Nuremaldron')).toMatchObject({
      org: 'Dragon',
      race: 'Crystl',
    });
    expect(scan("[51  Arch Ang ] ( Angel ) Raphiel, Commander of Heaven's Host", 'Raphiel')).toMatchObject({
      org: 'Angel',
      orgType: 'clan',
    });
  });

  it('records a clan-roster line (class only, no race) including the new Chaos Weaver class', () => {
    expect(scan('[51 Mtl] [ Slayers ]         Faelondir    Initiate', 'Faelondir')).toMatchObject({
      org: 'Slayers',
      class: 'Mtl',
      level: 51,
    });
    expect(scan('[51 CWv] [ Chaos ]           Deteryd      Lord             (Recruiter)', 'Deteryd')).toMatchObject({
      org: 'Chaos',
      class: 'CWv',
    });
  });

  it('records a roster line for a kingdom member too', () => {
    expect(scan('[51 Skd] (NT)          Somebodyelse    Knight', 'Somebodyelse')).toMatchObject({
      org: 'NT',
      orgType: 'kingdom',
      class: 'Skd',
    }); // synthetic: a kingdom roster in the same class-only layout
  });

  it('still skips immortals, unaffiliated players and unknown clans or kingdoms', () => {
    expect(scan('[70 Avg] [ Chaos ]           Scorn        Watcher          (Leader) (Recruiter)', 'Scorn')).toBeNull();
    expect(scan('[51 Lagoda Cha] Lohla, Keeper of Coin and Confidence.', 'Lohla')).toBeNull();
    expect(scan('[51  Human Arm] [ Madeupclan ] Someone Else', 'Someone')).toBeNull(); // synthetic
    expect(scan('[51  Human Arm] (Madeupland) Someone Else', 'Someone')).toBeNull(); // synthetic
    expect(scan('[51  Human Arm] ( ) Someone Else', 'Someone')).toBeNull(); // synthetic: empty parentheses
  });

  it('skips a rank title before the name: "Knight Ozzuluck" is recorded as Ozzuluck', () => {
    expect(scan('[51 Bakali Asn] (NT) Knight Ozzuluck', 'Ozzuluck')).toMatchObject({
      org: 'NT',
      race: 'Bakali',
      class: 'Asn',
    });
    expect(scan('[51 Bakali Asn] (NT) Knight Ozzuluck', 'Knight')).toBeNull();
  });

  it('a roster line, which has no race, keeps the race an earlier who line recorded', () => {
    current = setup();
    current.arm('who');
    raw('[51  Human Arm] [ Shadow ] Tiberius Caine, Acolyte of Shadow\r\n');
    raw('[51 Arm] [ Shadow ]          Tiberius     Adept\r\n');

    expect(current.getPerson('Tiberius')).toMatchObject({ org: 'Shadow', race: 'Human', class: 'Arm', level: 51 });
  });

  it('a later line moves a player to their new clan', () => {
    current = setup();
    current.arm('who');
    raw('[51  Human Arm] [ Shadow ] Tiberius Caine, Acolyte of Shadow\r\n');
    raw('[51  Human Arm] [ Loner ] Tiberius Caine\r\n');

    expect(current.getPerson('Tiberius')).toMatchObject({ org: 'Loner', orgType: 'clan' });
  });

  it('ignores a name that is missing or only one character long', () => {
    expect(scan('[51  Human Arm] [ Shadow ] X', 'X')).toBeNull(); // synthetic
    current = setup();
    current.arm('who');
    raw('[51  Human Arm] [ Shadow ] ...\r\n'); // synthetic: nothing name-like after the clan
    expect(current.getPerson('...')).toBeNull();
    expect(current.getPerson('')).toBeNull();
  });

  it('records the craft and rank from a whocraft line, and keeps the clan already known for that player', () => {
    current = setup();
    current.arm('whocraft');
    raw('[51  Human Sam] [ Shadow ] Aothien Galazios, Inquisitor of the Rose\r\n');
    raw('Aothien - Legendary Grand Master Armorcrafter [ Shadow ]\r\n');

    expect(current.getPerson('Aothien')).toMatchObject({
      craft: 'Armorcrafter',
      craftRank: 'Legendary Grand Master',
      org: 'Shadow',
      class: 'Sam',
    });
  });

  it('records a craft line for a player not seen before', () => {
    expect(scan('Thuken - Legendary Grand Master Tailor [ Wargar ]', 'Thuken')).toMatchObject({
      craft: 'Tailor',
      craftRank: 'Legendary Grand Master',
    });
  });

  it('records the same people with debug on: the debug option only adds logging, never changes what is stored', () => {
    current = setup(true);
    current.arm('who');
    raw('[51  Human Arm] [ Shadow ] Tiberius Caine, Acolyte of Shadow\r\n');
    raw('Aothien - Legendary Grand Master Armorcrafter [ Shadow ]\r\n');

    expect(current.getPerson('Tiberius')).toMatchObject({ org: 'Shadow', level: 51, race: 'Human' });
    expect(current.getPerson('Aothien')).toMatchObject({ craft: 'Armorcrafter' });
  });

  it('a line that reads as level 0 does not wipe a level already known (synthetic: level 0 is not sampled)', () => {
    current = setup();
    current.arm('who');
    raw('[51  Human Arm] [ Shadow ] Tiberius Caine, Acolyte of Shadow\r\n');
    raw('[ 0  Human Arm] [ Shadow ] Tiberius Caine\r\n');

    expect(current.getPerson('Tiberius')).toMatchObject({ level: 51, org: 'Shadow' });
  });

  it('does not record a `gr` group row as a person', () => {
    expect(scan('[51 Skn] Kabal             79% hp  55% mana 100% mv', 'Kabal')).toBeNull();
    expect(scan('[51 Mob] a menacing felbeast  97% hp 100% mana 100% mv', 'a')).toBeNull();
  });
});
