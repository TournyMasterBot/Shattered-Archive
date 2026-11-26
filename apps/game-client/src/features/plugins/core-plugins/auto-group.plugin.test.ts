import type { PluginRuntimeApi } from '@shatteredarchive/types-client';

const LEADER = 'Melchaleve';

// Real capture shapes (ANSI stripped), Docker game-server logs.
const FOLLOW = (n: string) => `${n} now follows you.\r\n`;
const STOP = (n: string) => `${n} stops following you.\r\n`;
const JOINED = (n: string) => `${n} joins your group.\r\n`;
const PROMPT = '<1645/1645hp 962/1240m 406/406mv>\r\n';
/** What the game prints for `gr`: a header, one row per member (the leader included), then the prompt. */
const GR_BODY = (members: string[]) =>
  `${LEADER}'s group:\r\n` +
  [LEADER, ...members].map((n) => `[51 Arm] ${n.padEnd(16)} 100% hp  83% mana 100% mv\r\n`).join('');
const GR = (members: string[]) => GR_BODY(members) + PROMPT;

const TIBERIUS_WHOIS = '[51  Human Arm] [ Shadow ] Tiberius Caine, Acolyte of Shadow\r\n';
const EZRIANNE_WHOIS = '[51  Human Sam] [ Bloodlust ] Ezrianne Vale, Initiate of Bloodlust\r\n'; // clan synthetic
const LOHLA_WHOIS = '[51 Lagoda Cha] Lohla, Keeper of Coin and Confidence.\r\n';
const NOT_FOUND = 'No one of that name is playing.\r\n';

const DAY = 24 * 60 * 60 * 1000;

/**
 * peopleDb is a module-level singleton that also persists to localStorage, so every test gets a fresh
 * module graph and an empty storage (same convention as people.plugin.test.ts).
 * `autoGr` makes the fake game answer each `gr` at once with a group holding only the leader.
 */
function setup(config: Record<string, unknown> = {}, autoGr = true) {
  jest.resetModules();
  if (typeof window !== 'undefined') window.localStorage.clear();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createAutoGroupPlugin } = require('./auto-group.plugin') as typeof import('./auto-group.plugin');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const db = require('./peopleDb') as typeof import('./peopleDb');

  const plugin = createAutoGroupPlugin();
  const cfg: Record<string, unknown> = { ...plugin.configSchema!.defaults, ...config };

  const handlers = new Set<(payload: unknown) => void>();
  const emit = (rawText: unknown) => handlers.forEach((h) => h(rawText === null ? null : { rawText }));
  const sendCommand = jest.fn((cmd: string) => {
    if (autoGr && cmd === 'gr') emit(GR([]));
  });
  const writeTerminal = jest.fn();

  const api = {
    connectionId: 'test',
    pluginId: 'auto-group',
    getConfig: () => ({ ...cfg }),
    sendCommand,
    writeTerminal,
    onEvent: (name: string, handler: (payload: unknown) => void) => {
      if (name !== 'shatteredarchive:raw-data') return () => undefined;
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  } as unknown as PluginRuntimeApi;

  const cleanup = plugin.onEnable!(api) as () => void;
  const sent = () => sendCommand.mock.calls.map((c) => c[0] as string);
  /** Commands other than the `gr` checks. */
  const cmds = () => sent().filter((c) => c !== 'gr');

  return { plugin, db, cfg, emit, sendCommand, sent, cmds, writeTerminal, cleanup, handlers };
}

const announced = (writeTerminal: jest.Mock) => writeTerminal.mock.calls.map((c) => String(c[0]));

describe('auto-group plugin', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  describe('rules with no affiliation lookup (no whois ever)', () => {
    it('does nothing on a default install, and says why', () => {
      const { emit, sent, writeTerminal } = setup();
      emit(FOLLOW('Ezrianne'));
      expect(sent()).toEqual([]);
      expect(announced(writeTerminal)[0]).toContain('Ezrianne');
      expect(announced(writeTerminal)[0]).toContain('not grouped: no rule matched');
    });

    it('groups an allowed user (case-insensitive) after a gr check, without a whois', () => {
      const { emit, sent, writeTerminal } = setup({ allowedUsers: 'ezrianne, Tiberius' });
      emit(FOLLOW('Ezrianne'));
      expect(sent()).toEqual(['gr', 'group Ezrianne']);
      expect(announced(writeTerminal)[0]).toContain('grouped: allowed user');
    });

    it('never groups an excluded user, even one that is also allowed', () => {
      const { emit, sent } = setup({ allowedUsers: 'Ezrianne', excludedUsers: 'Ezrianne', defaultAction: 'group' });
      emit(FOLLOW('Ezrianne'));
      expect(sent()).toEqual([]);
    });

    it('groups everyone not excluded when "Everyone else" is Group them', () => {
      const { emit, cmds } = setup({ defaultAction: 'group', excludedUsers: 'Kevyn' });
      emit(FOLLOW('Ezrianne'));
      emit(FOLLOW('Kevyn'));
      expect(cmds()).toEqual(['group Ezrianne']);
    });

    it('ignores NPC followers entirely', () => {
      const { emit, sent, writeTerminal } = setup({ defaultAction: 'group' });
      emit('An earth elemental now follows you.\r\nYan Luo now follows you.\r\nA raven now follows you.\r\n');
      expect(sent()).toEqual([]);
      expect(writeTerminal).not.toHaveBeenCalled();
    });

    it('survives empty and malformed payloads', () => {
      const { emit, sent } = setup({ defaultAction: 'group' });
      expect(() => {
        emit('');
        emit(null);
        emit(undefined);
      }).not.toThrow();
      expect(sent()).toEqual([]);
    });

    it('reacts to a follow line inside a larger chunk with colour codes', () => {
      const { emit, cmds } = setup({ allowedUsers: 'Ezrianne' });
      emit('\x1b[0mYou stand here.\r\n\x1b[1;36mEzrianne\x1b[0m now follows you.\r\n<1645/1645hp>');
      expect(cmds()).toEqual(['group Ezrianne']);
    });

    it('stays quiet in the terminal when announce is off', () => {
      const { emit, cmds, writeTerminal } = setup({ allowedUsers: 'Ezrianne', announce: false });
      emit(FOLLOW('Ezrianne'));
      emit(FOLLOW('Kevyn'));
      expect(cmds()).toEqual(['group Ezrianne']);
      expect(writeTerminal).not.toHaveBeenCalled();
    });
  });

  describe('checking `gr` before grouping (the real group state decides)', () => {
    it('sends gr first and holds `group` until the reply is read', () => {
      const { emit, sent } = setup({ allowedUsers: 'Ezrianne' }, false);
      emit(FOLLOW('Ezrianne'));
      expect(sent()).toEqual(['gr']);

      emit(GR([]));
      expect(sent()).toEqual(['gr', 'group Ezrianne']);
    });

    it('does not send `group` for someone `gr` already lists, which would take them out', () => {
      const { emit, sent, writeTerminal } = setup({ allowedUsers: 'Ezrianne' }, false);
      emit(FOLLOW('Ezrianne'));
      emit(GR(['Tiberius', 'ezrianne']));
      expect(sent()).toEqual(['gr']);
      expect(announced(writeTerminal).pop()).toContain('Ezrianne');
      expect(announced(writeTerminal).pop()).toContain('is already in your group');
    });

    it('is not fooled by other members, or by mobs, in the list', () => {
      const { emit, sent } = setup({ allowedUsers: 'Ezrianne' }, false);
      emit(FOLLOW('Ezrianne'));
      emit(
        `${LEADER}'s group:\r\n[51 Mob] An earth elemental  95% hp 100% mana 100% mv\r\n[43 Mob] Yan luo           86% hp 100% mana 100% mv\r\n[51 Arm] Tiberius         100% hp  83% mana 100% mv\r\n${PROMPT}`,
      );
      expect(sent()).toEqual(['gr', 'group Ezrianne']);
    });

    it('regroups a follower who left and followed again: stop + follow in one chunk, group list without them', () => {
      const { emit, sent } = setup({ allowedUsers: 'Tiberius' }, false);
      emit(FOLLOW('Tiberius'));
      emit(GR([]));
      emit(JOINED('Tiberius'));
      expect(sent()).toEqual(['gr', 'group Tiberius']);

      // the real sequence: "Tiberius stops following you." then "Tiberius now follows you."
      emit(STOP('Tiberius') + FOLLOW('Tiberius'));
      expect(sent()).toEqual(['gr', 'group Tiberius', 'gr']);
      emit(GR([])); // they are not in the group any more
      expect(sent()).toEqual(['gr', 'group Tiberius', 'gr', 'group Tiberius']);
    });

    it('has no long shield: a group breaker minutes later is regrouped, and an intact group is left alone', () => {
      const { emit, sent } = setup({ allowedUsers: 'Ezrianne' }, false);
      emit(FOLLOW('Ezrianne'));
      emit(GR([]));
      emit(JOINED('Ezrianne'));

      jest.advanceTimersByTime(60_000);
      emit(FOLLOW('Ezrianne')); // beckoned or re-followed, group was broken
      emit(GR([])); // gr no longer lists her
      expect(sent()).toEqual(['gr', 'group Ezrianne', 'gr', 'group Ezrianne']);

      emit(JOINED('Ezrianne'));
      jest.advanceTimersByTime(60_000);
      emit(FOLLOW('Ezrianne')); // follows again but the group is intact
      emit(GR(['Ezrianne']));
      expect(sent()).toEqual(['gr', 'group Ezrianne', 'gr', 'group Ezrianne', 'gr']); // no third `group`
    });

    it('ignores a doubled follow line while its own `group` is unconfirmed, so it cannot toggle them out', () => {
      const { emit, cmds } = setup({ allowedUsers: 'Ezrianne' });
      emit(FOLLOW('Ezrianne'));
      emit(FOLLOW('Ezrianne'));
      expect(cmds()).toEqual(['group Ezrianne']);
    });

    it('lets the follow through again when the game confirmed the join', () => {
      const { emit, sent } = setup({ allowedUsers: 'Ezrianne' }, false);
      emit(FOLLOW('Ezrianne'));
      emit(GR([]));
      emit(JOINED('Ezrianne'));
      emit(FOLLOW('Ezrianne'));
      expect(sent()).toEqual(['gr', 'group Ezrianne', 'gr']);
    });

    it('lets the follow through again after the 5 second confirmation window, and not before', () => {
      const { emit, cmds } = setup({ allowedUsers: 'Ezrianne' });
      emit(FOLLOW('Ezrianne'));
      jest.advanceTimersByTime(4_900);
      emit(FOLLOW('Ezrianne'));
      expect(cmds()).toEqual(['group Ezrianne']);

      jest.advanceTimersByTime(200);
      emit(FOLLOW('Ezrianne'));
      expect(cmds()).toEqual(['group Ezrianne', 'group Ezrianne']);
    });

    it('sends one gr for a follower who follows twice before the reply', () => {
      const { emit, sent } = setup({ allowedUsers: 'Ezrianne' }, false);
      emit(FOLLOW('Ezrianne'));
      emit(FOLLOW('Ezrianne'));
      expect(sent()).toEqual(['gr']);
    });

    it('answers two followers from two gr replies, oldest first', () => {
      const { emit, sent } = setup({ allowedUsers: 'Ezrianne, Tiberius' }, false);
      emit(FOLLOW('Ezrianne'));
      emit(FOLLOW('Tiberius'));
      expect(sent()).toEqual(['gr', 'gr']);

      emit(GR(['Ezrianne'])); // first reply: Ezrianne is in, no group
      expect(sent()).toEqual(['gr', 'gr']);
      emit(GR([])); // second reply: Tiberius is not
      expect(sent()).toEqual(['gr', 'gr', 'group Tiberius']);
    });

    it('reads a reply split across chunks: header, rows, then the prompt', () => {
      const { emit, sent } = setup({ allowedUsers: 'Ezrianne' }, false);
      emit(FOLLOW('Ezrianne'));
      emit(`${LEADER}'s group:\r\n`);
      emit(`[51 Arm] ${LEADER.padEnd(16)} 100% hp  83% mana 100% mv\r\n`);
      emit('[51 Skd] Ezrianne         100% hp  83% mana 100% mv\r\n');
      expect(sent()).toEqual(['gr']); // not decided until the list ends
      emit(PROMPT);
      expect(sent()).toEqual(['gr']); // she was listed: no `group`
    });

    it('ends the list at combat output and still handles a follow line right behind it', () => {
      const { emit, sent } = setup({ allowedUsers: 'Ezrianne, Kevyn' }, false);
      emit(FOLLOW('Ezrianne'));
      emit(GR_BODY([]) + 'Kabal rescues Archal!\r\n' + FOLLOW('Kevyn'));
      expect(sent()).toEqual(['gr', 'group Ezrianne', 'gr']); // Kevyn's own check started
    });

    it('groups anyway, and says so, when the gr reply never comes', () => {
      const { emit, sent, writeTerminal } = setup({ allowedUsers: 'Ezrianne' }, false);
      emit(FOLLOW('Ezrianne'));
      jest.advanceTimersByTime(2_900);
      expect(sent()).toEqual(['gr']);
      jest.advanceTimersByTime(200);
      expect(sent()).toEqual(['gr', 'group Ezrianne']);
      expect(announced(writeTerminal).pop()).toContain('could not read your group list first');
    });

    it('a list that starts but never ends times out cleanly, and later stray rows change nothing', () => {
      const { emit, sent } = setup({ allowedUsers: 'Ezrianne' }, false);
      emit(FOLLOW('Ezrianne'));
      emit(`${LEADER}'s group:\r\n`);
      jest.advanceTimersByTime(3_000);
      expect(sent()).toEqual(['gr', 'group Ezrianne']);

      expect(() => emit('[51 Skd] Ezrianne         100% hp  83% mana 100% mv\r\n' + PROMPT)).not.toThrow();
      expect(sent()).toEqual(['gr', 'group Ezrianne']);
    });

    it('leaves a gr the player typed alone when no check is waiting', () => {
      const { emit, sent, writeTerminal } = setup({ allowedUsers: 'Ezrianne' }, false);
      emit(GR(['Ezrianne']));
      expect(sent()).toEqual([]);
      expect(writeTerminal).not.toHaveBeenCalled();
    });
  });

  describe('affiliation lookup', () => {
    it('sends one whois, then checks gr and groups when the reply is an allowed clan, and remembers it', () => {
      const { emit, sent, db } = setup({ allowedAffiliations: 'Shadow' });
      emit(FOLLOW('Tiberius'));
      expect(sent()).toEqual(['whois Tiberius']);

      emit(TIBERIUS_WHOIS);
      expect(sent()).toEqual(['whois Tiberius', 'gr', 'group Tiberius']);

      const person = db.getPerson('Tiberius');
      expect(person).toMatchObject({
        name: 'Tiberius',
        level: 51,
        race: 'Human',
        class: 'Arm',
        org: 'Shadow',
        orgType: 'clan',
      });
      expect(typeof person?.affiliationCheckedAt).toBe('number');
    });

    it('does not group a clan that is not allowed, and does not send gr', () => {
      const { emit, sent } = setup({ allowedAffiliations: 'Shadow' });
      emit(FOLLOW('Ezrianne'));
      emit(EZRIANNE_WHOIS);
      expect(sent()).toEqual(['whois Ezrianne']);
    });

    it('does not group an excluded clan and groups everyone else when the default is group', () => {
      const { emit, cmds } = setup({ excludedAffiliations: 'Shadow', defaultAction: 'group' });
      emit(FOLLOW('Tiberius'));
      emit(TIBERIUS_WHOIS);
      emit(FOLLOW('Ezrianne'));
      emit(EZRIANNE_WHOIS);
      expect(cmds()).toEqual(['whois Tiberius', 'whois Ezrianne', 'group Ezrianne']);
    });

    it('remembers "no affiliation" so a player with none is not looked up again', () => {
      const { emit, cmds, db } = setup({ allowedAffiliations: 'none' });
      emit(FOLLOW('Lohla'));
      emit(LOHLA_WHOIS);
      expect(cmds()).toEqual(['whois Lohla', 'group Lohla']);
      expect(db.getPerson('Lohla')).toMatchObject({ org: '', orgType: '' });
      expect(typeof db.getPerson('Lohla')?.affiliationCheckedAt).toBe('number');

      emit(STOP('Lohla') + FOLLOW('Lohla'));
      expect(cmds()).toEqual(['whois Lohla', 'group Lohla', 'group Lohla']); // no second whois
    });

    it('does not look the player up again while the memory is fresh', () => {
      const { emit, cmds } = setup({ allowedAffiliations: 'Shadow' });
      emit(FOLLOW('Tiberius'));
      emit(TIBERIUS_WHOIS);
      emit(STOP('Tiberius') + FOLLOW('Tiberius'));
      expect(cmds().filter((c) => c.startsWith('whois'))).toEqual(['whois Tiberius']);
      expect(cmds().filter((c) => c.startsWith('group'))).toEqual(['group Tiberius', 'group Tiberius']);
    });

    it('uses an affiliation the People plugin already learned from a who list, with no whois', () => {
      const { emit, cmds, db } = setup({ allowedAffiliations: 'NT' });
      db.setPerson('Kevyn', { name: 'Kevyn', org: 'New Thalos', orgType: 'kingdom' }); // lastSeen = now
      emit(FOLLOW('Kevyn'));
      expect(cmds()).toEqual(['group Kevyn']);
    });

    it('looks the player up again once the remembered affiliation is older than the max age', () => {
      const { emit, cmds, db } = setup({ allowedAffiliations: 'Shadow', affiliationMaxAgeDays: 30 });
      db.setPerson('Tiberius', {
        name: 'Tiberius',
        org: 'Bloodlust',
        orgType: 'clan',
        affiliationCheckedAt: Date.now() - 40 * DAY,
      });
      emit(FOLLOW('Tiberius'));
      expect(cmds()).toEqual(['whois Tiberius']);
      emit(TIBERIUS_WHOIS);
      expect(cmds()).toEqual(['whois Tiberius', 'group Tiberius']);
      expect(db.getPerson('Tiberius')?.org).toBe('Shadow'); // memory updated
    });

    it('treats a junk max age as the 30-day default and 0 as never expiring', () => {
      const old = (db: typeof import('./peopleDb'), days: number) =>
        db.setPerson('Tiberius', {
          name: 'Tiberius',
          org: 'Shadow',
          orgType: 'clan',
          affiliationCheckedAt: Date.now() - days * DAY,
        });

      const junk = setup({ allowedAffiliations: 'Shadow', affiliationMaxAgeDays: 'abc' });
      old(junk.db, 10);
      junk.emit(FOLLOW('Tiberius'));
      expect(junk.cmds()).toEqual(['group Tiberius']); // 10 days < 30

      const junk2 = setup({ allowedAffiliations: 'Shadow', affiliationMaxAgeDays: -5 });
      old(junk2.db, 40);
      junk2.emit(FOLLOW('Tiberius'));
      expect(junk2.cmds()).toEqual(['whois Tiberius']); // 40 days > 30

      const never = setup({ allowedAffiliations: 'Shadow', affiliationMaxAgeDays: 0 });
      old(never.db, 4000);
      never.emit(FOLLOW('Tiberius'));
      expect(never.cmds()).toEqual(['group Tiberius']);
    });

    it('falls back to the stale memory when the whois gets no reply', () => {
      const { emit, cmds, db } = setup({ allowedAffiliations: 'Shadow', affiliationMaxAgeDays: 30 });
      db.setPerson('Tiberius', {
        name: 'Tiberius',
        org: 'Shadow',
        orgType: 'clan',
        affiliationCheckedAt: Date.now() - 40 * DAY,
      });
      emit(FOLLOW('Tiberius'));
      expect(cmds()).toEqual(['whois Tiberius']);
      jest.advanceTimersByTime(4_000);
      expect(cmds()).toEqual(['whois Tiberius', 'group Tiberius']);
    });

    it('uses the default action when the whois times out and nothing is remembered', () => {
      const ignore = setup({ allowedAffiliations: 'Shadow' });
      ignore.emit(FOLLOW('Tiberius'));
      jest.advanceTimersByTime(4_000);
      expect(ignore.cmds()).toEqual(['whois Tiberius']);
      expect(announced(ignore.writeTerminal).pop()).toContain('affiliation unavailable');

      const grp = setup({ allowedAffiliations: 'Shadow', defaultAction: 'group' });
      grp.emit(FOLLOW('Tiberius'));
      jest.advanceTimersByTime(4_000);
      expect(grp.cmds()).toEqual(['whois Tiberius', 'group Tiberius']);
    });

    it('treats "No one of that name is playing." as a miss for the oldest pending whois', () => {
      const { emit, cmds, db } = setup({ allowedAffiliations: 'Shadow', defaultAction: 'group' });
      emit(FOLLOW('Tiberius'));
      emit(FOLLOW('Ezrianne'));
      emit('No one of that name is playing.\r\n'); // Tiberius's reply comes first
      expect(cmds()).toEqual(['whois Tiberius', 'whois Ezrianne', 'group Tiberius']);
      emit(EZRIANNE_WHOIS);
      expect(cmds()).toEqual(['whois Tiberius', 'whois Ezrianne', 'group Tiberius', 'group Ezrianne']);
      expect(db.getPerson('Tiberius')).toBeNull(); // a miss stores nothing
    });

    it('sends a single whois for a player who follows twice before the reply', () => {
      const { emit, sent } = setup({ allowedAffiliations: 'Shadow' });
      emit(FOLLOW('Tiberius'));
      emit(FOLLOW('Tiberius'));
      expect(sent()).toEqual(['whois Tiberius']);
    });

    it('ignores a who-style line about someone else while waiting', () => {
      const { emit, cmds } = setup({ allowedAffiliations: 'Shadow' });
      emit(FOLLOW('Ezrianne'));
      emit('You drink water from a decanter of endless water.\r\n'); // ordinary output while waiting
      emit(TIBERIUS_WHOIS); // a different player's line must not settle Ezrianne
      expect(cmds()).toEqual(['whois Ezrianne']);
      emit('[51  Human Sam] [ Shadow ] Ezrianne Vale, Initiate of Shadow\r\n');
      expect(cmds()).toEqual(['whois Ezrianne', 'group Ezrianne']);
    });

    it('does not mistake a gr row about the same player for the whois reply', () => {
      const { emit, cmds, db } = setup({ allowedAffiliations: 'Shadow' }, false);
      emit(FOLLOW('Ezrianne'));
      emit('[51 Skd] Ezrianne         100% hp  83% mana 100% mv\r\n'); // a row from some earlier gr
      expect(cmds()).toEqual(['whois Ezrianne']);
      expect(db.getPerson('Ezrianne')).toBeNull();
    });

    it('ignores unrelated lines and a whois reply when nothing is pending', () => {
      const { emit, sent, db } = setup({ allowedAffiliations: 'Shadow' });
      emit(TIBERIUS_WHOIS);
      emit(NOT_FOUND);
      emit('You drink water from a decanter of endless water.\r\n');
      expect(sent()).toEqual([]);
      expect(db.getPerson('Tiberius')).toBeNull();
    });

    it('does not re-whois a flapping follower inside the cooldown, then does after it', () => {
      const { emit, cmds } = setup({ allowedAffiliations: 'Shadow' });
      emit(FOLLOW('Tiberius'));
      jest.advanceTimersByTime(4_000); // no reply: settled by the default (ignore)
      emit(FOLLOW('Tiberius'));
      expect(cmds()).toEqual(['whois Tiberius']); // inside 30 s: no second whois

      jest.advanceTimersByTime(30_000);
      emit(FOLLOW('Tiberius'));
      expect(cmds()).toEqual(['whois Tiberius', 'whois Tiberius']);
    });

    it('does not store an immortal in the People database but still decides on the reply', () => {
      const { emit, cmds, db } = setup({ allowedAffiliations: 'Shadow' });
      emit(FOLLOW('Tiberius'));
      emit('[52  Human Arm] [ Shadow ] Tiberius Caine, Acolyte of Shadow\r\n'); // level 52 is synthetic
      expect(cmds()).toEqual(['whois Tiberius', 'group Tiberius']);
      expect(db.getPerson('Tiberius')).toBeNull();
    });

    it('reads the affiliation of the new kinds of line: a starred clan, a clan in parentheses, a rank beside a kingdom', () => {
      const star = setup({ allowedAffiliations: 'Shadow' });
      star.emit(FOLLOW('Telthian'));
      star.emit('[51  Human Skn] [ Shadow*] (WANTED) Telthian Schwartz,     Herald of the Umbratide\r\n');
      expect(star.cmds()).toEqual(['whois Telthian', 'group Telthian']);

      const dragon = setup({ allowedAffiliations: 'Dragon' });
      dragon.emit(FOLLOW('Hephaestus'));
      dragon.emit('[51  Brass Dra] ( Dragon ) Hephaestus.\r\n');
      expect(dragon.cmds()).toEqual(['whois Hephaestus', 'group Hephaestus']);
      expect(dragon.db.getPerson('Hephaestus')).toMatchObject({ org: 'Dragon', orgType: 'clan', class: 'Dra' });

      const queen = setup({ allowedAffiliations: 'VR' });
      queen.emit(FOLLOW('Piknim'));
      queen.emit('[51 Kender Wit] (Queen)(Verminasia) Piknim Cracklespark, Darkfinder of the Black Moon\r\n');
      expect(queen.cmds()).toEqual(['whois Piknim', 'group Piknim']);
    });

    it('reads the rules again when the reply arrives, so an edit made while waiting applies', () => {
      const { emit, cmds, cfg } = setup({ allowedAffiliations: 'Shadow' });
      emit(FOLLOW('Tiberius'));
      cfg.excludedUsers = 'Tiberius'; // edited while the whois is in flight
      emit(TIBERIUS_WHOIS);
      expect(cmds()).toEqual(['whois Tiberius']);
    });
  });

  describe('lifecycle', () => {
    it('stops listening and cancels a waiting whois on disable', () => {
      const { emit, sent, cleanup, handlers } = setup({ allowedAffiliations: 'Shadow', defaultAction: 'group' });
      emit(FOLLOW('Tiberius'));
      cleanup();
      expect(handlers.size).toBe(0);
      jest.advanceTimersByTime(10_000);
      expect(sent()).toEqual(['whois Tiberius']); // the timeout did not fire a late `group`
    });

    it('cancels a waiting gr check on disable, so no late `group` goes out', () => {
      const { emit, sent, cleanup } = setup({ allowedUsers: 'Ezrianne' }, false);
      emit(FOLLOW('Ezrianne'));
      cleanup();
      jest.advanceTimersByTime(10_000);
      expect(sent()).toEqual(['gr']);
    });

    it('declares its stable id and a default for every config field', () => {
      const { plugin } = setup();
      expect(plugin.manifest.id).toBe('auto-group');
      const keys = plugin.configSchema!.fields.map((f) => f.key).sort();
      expect(keys).toEqual(Object.keys(plugin.configSchema!.defaults!).sort());
    });
  });
});
