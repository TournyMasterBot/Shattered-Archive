import {
  cleanLines,
  decide,
  isGroupHeader,
  isWhoisNotFound,
  lookupAffiliation,
  needsAffiliation,
  parseAffiliationList,
  parseFollowLine,
  parseGroupRow,
  parseJoinedLine,
  parseList,
  parseStopLine,
  readRules,
  type AutoGroupRules,
} from './auto-group-logic';

// Every sample line below is a real capture from the Docker game-server log corpus
// (C:\Projects\DSL\GameLogs\ShatteredArchive\Docker\game-server), ANSI stripped, unless marked synthetic.

const DAY = 24 * 60 * 60 * 1000;

function rules(over: Partial<Record<keyof AutoGroupRules, string>> = {}): AutoGroupRules {
  return readRules({ defaultAction: 'ignore', ...over });
}

describe('line parsers', () => {
  it('reads the follower from a player follow line', () => {
    expect(parseFollowLine('Ezrianne now follows you.')).toBe('Ezrianne');
    expect(parseFollowLine('Tiberius now follows you.')).toBe('Tiberius');
  });

  it("accepts an apostrophe inside a name (synthetic, from the real name Z'resra)", () => {
    expect(parseFollowLine("Z'resra now follows you.")).toBe("Z'resra");
  });

  it('rejects NPC followers: articles, lowercase starts and two-word names', () => {
    expect(parseFollowLine('An earth elemental now follows you.')).toBeNull();
    expect(parseFollowLine('A raven now follows you.')).toBeNull();
    expect(parseFollowLine('An unholy steed now follows you.')).toBeNull();
    expect(parseFollowLine('a hulking demonic wolven now follows you.')).toBeNull();
    expect(parseFollowLine('Yan Luo now follows you.')).toBeNull();
  });

  it('rejects text that merely contains the phrase', () => {
    expect(parseFollowLine('The breeze off of the warm waters seem to follow you whichever direction you')).toBeNull();
    expect(parseFollowLine("Ezrianne says 'Ezrianne now follows you.'")).toBeNull();
  });

  it('reads who joined the group', () => {
    expect(parseJoinedLine('Ezrianne joins your group.')).toBe('Ezrianne');
    expect(parseJoinedLine('Someone joins your group.')).toBe('Someone');
    expect(parseJoinedLine("Daizi isn't following you.")).toBeNull();
  });

  it('reads who stopped following, players only', () => {
    expect(parseStopLine('Tiberius stops following you.')).toBe('Tiberius');
    expect(parseStopLine('Ezrianne stops following you.')).toBe('Ezrianne');
    expect(parseStopLine('Yan Luo stops following you.')).toBeNull();
    expect(parseStopLine('An earth elemental stops following you.')).toBeNull();
    expect(parseStopLine('You stop following Archal.')).toBeNull();
  });

  it('recognises the `gr` header, with or without a title before the leader', () => {
    expect(isGroupHeader("Melchaleve's group:")).toBe(true);
    expect(isGroupHeader("The ghost of Melchaleve's group:")).toBe(true);
    expect(isGroupHeader("someone's group:")).toBe(true);
    expect(isGroupHeader('Melchaleve group:')).toBe(false);
    expect(isGroupHeader("Melchaleve's group: three members")).toBe(false);
  });

  it('reads the member name from a `gr` row (lowercased), mobs and multi-word names included', () => {
    expect(parseGroupRow('[51 Arm] Tiberius         100% hp  83% mana 100% mv')).toBe('tiberius');
    expect(parseGroupRow('[51 Skd] Ezrianne          84% hp  92% mana 100% mv')).toBe('ezrianne');
    expect(parseGroupRow('[51 Mob] a menacing felbeast  97% hp 100% mana 100% mv')).toBe('a menacing felbeast');
    expect(parseGroupRow('[43 Mob] Yan luo           86% hp 100% mana 100% mv')).toBe('yan luo');
    expect(parseGroupRow('[51 Nin] Soraea           102% hp  53% mana 100% mv')).toBe('soraea');
  });

  it('does not read other lines as `gr` rows', () => {
    expect(parseGroupRow('[51  Human Arm] [ Shadow ] Tiberius Caine, Acolyte of Shadow')).toBeNull();
    expect(parseGroupRow('<1645/1645hp 962/1240m 406/406mv>')).toBeNull();
    expect(parseGroupRow('Kabal rescues Archal!')).toBeNull();
  });

  it('spots the whois miss line', () => {
    expect(isWhoisNotFound('No one of that name is playing.')).toBe(true);
    expect(isWhoisNotFound('No one of that name is playing')).toBe(false);
  });

  it('cleans a chunk: ANSI, carriage returns and blank lines go, text stays', () => {
    const chunk = '\x1b[0mEzrianne \x1b[1;37mnow follows you.\x1b[0m\r\n\r\n  \r\nYan Luo now follows you.\r\n';
    expect(cleanLines(chunk)).toEqual(['Ezrianne now follows you.', 'Yan Luo now follows you.']);
  });
});

describe('config lists', () => {
  it('splits on lines and commas, lowercases, drops blanks and # comments', () => {
    const set = parseList('Ezrianne, Tiberius\n# a note, ignored\n\n  Daizi  \r\nKevyn');
    expect([...set].sort()).toEqual(['daizi', 'ezrianne', 'kevyn', 'tiberius']);
  });

  it('ignores empty entries left by doubled or trailing commas', () => {
    expect([...parseList('Ezrianne,, Tiberius ,')].sort()).toEqual(['ezrianne', 'tiberius']);
  });

  it('gives an empty set for anything that is not a string', () => {
    expect(parseList(undefined).size).toBe(0);
    expect(parseList(42).size).toBe(0);
    expect(parseList(null).size).toBe(0);
  });

  it('expands an affiliation entry to its long and short form', () => {
    expect([...parseAffiliationList('New Thalos, Shadow')].sort()).toEqual(['new thalos', 'nt', 'shadow']);
  });

  it('reads rules, falling back to "ignore" for any default that is not exactly "group"', () => {
    expect(readRules({ defaultAction: 'group' }).defaultAction).toBe('group');
    expect(readRules({ defaultAction: 'GROUP' }).defaultAction).toBe('ignore');
    expect(readRules({}).defaultAction).toBe('ignore');
  });

  it('only needs an affiliation when an affiliation list is set', () => {
    expect(needsAffiliation(rules())).toBe(false);
    expect(needsAffiliation(rules({ allowedUsers: 'a', excludedUsers: 'b' }))).toBe(false);
    expect(needsAffiliation(rules({ allowedAffiliations: 'Shadow' }))).toBe(true);
    expect(needsAffiliation(rules({ excludedAffiliations: 'Shadow' }))).toBe(true);
  });
});

describe('lookupAffiliation (the People-DB memory)', () => {
  const now = 1_800_000_000_000;

  it('knows nothing about an unknown or affiliation-less record', () => {
    expect(lookupAffiliation(null, now, 30)).toEqual({ known: undefined, fresh: false });
    expect(lookupAffiliation(undefined, now, 30)).toEqual({ known: undefined, fresh: false });
    // a craft-only people entry: no org, no stamp
    expect(lookupAffiliation({ lastSeen: now }, now, 30)).toEqual({ known: undefined, fresh: false });
  });

  it('a stamped record with no org means "checked, none"', () => {
    expect(lookupAffiliation({ org: '', affiliationCheckedAt: now - DAY }, now, 30)).toEqual({
      known: '',
      fresh: true,
    });
    expect(lookupAffiliation({ affiliationCheckedAt: now - DAY }, now, 30)).toEqual({ known: '', fresh: true });
  });

  it('ages a stamped record by the stamp, not by lastSeen', () => {
    const rec = { org: 'Shadow', affiliationCheckedAt: now - 40 * DAY, lastSeen: now };
    expect(lookupAffiliation(rec, now, 30)).toEqual({ known: 'Shadow', fresh: false });
    expect(lookupAffiliation({ ...rec, affiliationCheckedAt: now - 29 * DAY }, now, 30).fresh).toBe(true);
  });

  it('uses a who-list org (no stamp), aged by lastSeen', () => {
    expect(lookupAffiliation({ org: 'NT', lastSeen: now - DAY }, now, 30)).toEqual({ known: 'NT', fresh: true });
    expect(lookupAffiliation({ org: 'NT', lastSeen: now - 31 * DAY }, now, 30).fresh).toBe(false);
    expect(lookupAffiliation({ org: 'NT' }, now, 30).fresh).toBe(false); // no lastSeen: treated as ancient
  });

  it('a max age of 0 never expires a remembered affiliation', () => {
    expect(lookupAffiliation({ org: 'Shadow', affiliationCheckedAt: now - 4000 * DAY }, now, 0).fresh).toBe(true);
  });
});

describe('decide', () => {
  it('excluded user wins over allowed user and everything else', () => {
    const r = rules({ allowedUsers: 'Tiberius', excludedUsers: 'tiberius', allowedAffiliations: 'Shadow' });
    expect(decide('Tiberius', r, 'Shadow')).toEqual({ action: 'ignore', reason: 'excluded user' });
  });

  it('an allowed user is grouped with no affiliation needed, even if the affiliation is excluded', () => {
    const r = rules({ allowedUsers: 'Tiberius', excludedAffiliations: 'Shadow' });
    expect(decide('Tiberius', r, undefined)).toEqual({ action: 'group', reason: 'allowed user' });
    expect(decide('tiberius', r, 'Shadow').action).toBe('group');
  });

  it('with no affiliation lists, the default applies and no lookup is asked for', () => {
    expect(decide('Kevyn', rules(), undefined)).toEqual({ action: 'ignore', reason: 'no rule matched' });
    const grp = readRules({ defaultAction: 'group' });
    expect(decide('Kevyn', grp, undefined)).toEqual({ action: 'group', reason: 'no rule matched, default is group' });
  });

  it('asks for the affiliation when a list is set and it is not known yet', () => {
    expect(decide('Kevyn', rules({ allowedAffiliations: 'Shadow' }), undefined).action).toBe('need-affiliation');
  });

  it('an excluded affiliation beats an allowed one', () => {
    const r = rules({ allowedAffiliations: 'Shadow', excludedAffiliations: 'Shadow' });
    expect(decide('Kevyn', r, 'Shadow')).toEqual({ action: 'ignore', reason: 'excluded affiliation shadow' });
  });

  it('groups an allowed affiliation and ignores one that is on neither list', () => {
    const r = rules({ allowedAffiliations: 'Shadow' });
    expect(decide('Kevyn', r, 'Shadow')).toEqual({ action: 'group', reason: 'allowed affiliation shadow' });
    expect(decide('Kevyn', r, 'Bloodlust')).toEqual({ action: 'ignore', reason: 'no rule matched' });
  });

  it('matches affiliations case-insensitively and through the long/short alias', () => {
    expect(decide('Kevyn', rules({ allowedAffiliations: 'nt' }), 'New Thalos').action).toBe('group');
    expect(decide('Kevyn', rules({ allowedAffiliations: 'New Thalos' }), 'NT').action).toBe('group');
    expect(decide('Kevyn', rules({ excludedAffiliations: 'SHADOW' }), 'shadow').action).toBe('ignore');
  });

  it('"none" matches a player with no clan or kingdom', () => {
    expect(decide('Lohla', rules({ allowedAffiliations: 'none' }), '').action).toBe('group');
    expect(decide('Lohla', rules({ excludedAffiliations: 'none' }), '  ').action).toBe('ignore');
    expect(decide('Lohla', rules({ allowedAffiliations: 'Shadow' }), '').action).toBe('ignore');
  });

  it('falls back to the default when the affiliation could not be found out', () => {
    expect(decide('Kevyn', rules({ allowedAffiliations: 'Shadow' }), null)).toEqual({
      action: 'ignore',
      reason: 'no rule matched; affiliation unavailable',
    });
    const grp = readRules({ allowedAffiliations: 'Shadow', defaultAction: 'group' });
    expect(decide('Kevyn', grp, null).action).toBe('group');
  });
});
