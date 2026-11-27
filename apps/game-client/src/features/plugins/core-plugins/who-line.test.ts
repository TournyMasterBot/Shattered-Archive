import { affiliationKeys, parseWhoLine, whoLineMentionsName } from './who-line';

// Every sample line is a real capture from the Docker game-server log corpus
// (C:\Projects\DSL\GameLogs\ShatteredArchive\Docker\game-server), ANSI stripped, unless marked synthetic.

describe('parseWhoLine: whois / who replies', () => {
  it('reads a clan in brackets', () => {
    expect(parseWhoLine('[51  Human Arm] [ Shadow ] Tiberius Caine, Acolyte of Shadow')).toEqual({
      level: 51,
      race: 'Human',
      class: 'Arm',
      org: 'Shadow',
      orgType: 'clan',
      rest: 'Tiberius Caine, Acolyte of Shadow',
    });
  });

  it('reads a multi-word clan', () => {
    expect(parseWhoLine('[51  Pixie WuJ] [ Black Robes ] Blinx, Dream Thief')).toMatchObject({
      org: 'Black Robes',
      orgType: 'clan',
    });
  });

  it('reads a kingdom in parentheses, with a title before the name', () => {
    const w = parseWhoLine('[51 DGnome Pri] (Gray Church) Monsignor Patron Tief     (Turpa) (Zandreya)');
    expect(w).toMatchObject({ race: 'DGnome', org: 'Gray Church', orgType: 'kingdom' });
    expect(w?.rest.startsWith('Monsignor Patron Tief')).toBe(true);
  });

  it('reports no affiliation when there is neither a clan nor a kingdom', () => {
    expect(parseWhoLine('[51 Lagoda Cha] Lohla, Keeper of Coin and Confidence.')).toMatchObject({
      org: '',
      orgType: '',
      rest: 'Lohla, Keeper of Coin and Confidence.',
    });
  });

  it('reads a low level padded with spaces', () => {
    expect(parseWhoLine('[ 5  Human Thi] [ Shadow ] Lhemec Raelein, Dark Knight of The Legion')).toMatchObject({
      level: 5,
      org: 'Shadow',
    });
  });

  it('takes any race and class token, new ones included (nothing is whitelisted)', () => {
    expect(parseWhoLine('[51 Crystl Dra] ( Dragon ) (WANTED) Nuremaldron the Omnilescent.')).toMatchObject({
      race: 'Crystl',
      class: 'Dra',
    });
    expect(parseWhoLine('[ 5 Copper Dra] ( Dragon ) Uriol')).toMatchObject({ race: 'Copper', class: 'Dra' });
    expect(
      parseWhoLine('[51  Hd Balanx] ( Balanx ) Zyphros, Chronicler of Kwainin (Keeper of the Scales)'),
    ).toMatchObject({
      race: 'Hd',
      class: 'Balanx',
    });
  });

  it('reads a stat block with a space before the closing bracket', () => {
    expect(parseWhoLine("[51  Arch Ang ] ( Angel ) Raphiel, Commander of Heaven's Host")).toMatchObject({
      race: 'Arch',
      class: 'Ang',
      org: 'Angel',
    });
  });
});

describe('parseWhoLine: status flags and ranks', () => {
  it('skips (Hostile) and (WANTED) after a clan', () => {
    expect(parseWhoLine('[51  Pixie Ill] [ Chaos ] (Hostile) (WANTED) Pingu N. Noot.')).toMatchObject({
      org: 'Chaos',
      orgType: 'clan',
      rest: 'Pingu N. Noot.',
    });
    expect(
      parseWhoLine('[51  Human Shu] [ Shadow ] (WANTED) Melchaleve Arden, Warder of the Gray Robes'),
    ).toMatchObject({
      org: 'Shadow',
      rest: 'Melchaleve Arden, Warder of the Gray Robes',
    });
  });

  it('skips [AFK] and a leading (WANTED) before a kingdom', () => {
    expect(parseWhoLine('[51  Human Pal] [AFK] (Emperor)(Althainia) Agapitos di Lucis')).toMatchObject({
      org: 'Althainia',
      orgType: 'kingdom',
    });
    expect(parseWhoLine('[51  Human Pal] (WANTED) (Emperor)(Althainia) Agapitos di Lucis')).toMatchObject({
      org: 'Althainia',
      orgType: 'kingdom',
    });
  });

  it('picks the kingdom out of a rank + kingdom pair, whichever side the rank is on', () => {
    expect(
      parseWhoLine('[51 Kender Wit] (Queen)(Verminasia) Piknim Cracklespark, Darkfinder of the Black Moon'),
    ).toMatchObject({
      org: 'Verminasia',
      rest: 'Piknim Cracklespark, Darkfinder of the Black Moon',
    });
    expect(parseWhoLine('[51  Human Mtl] (Marauders)(HighLord) Fredrik')).toMatchObject({ org: 'Marauders' });
    expect(parseWhoLine('[28  Human Mtl] (HighLord)(Marauders) Fredrik')).toMatchObject({ org: 'Marauders' });
  });

  it('with no known kingdom in a pair, takes the last paren (rank-first is the common order)', () => {
    // synthetic: neither word is a known kingdom
    expect(parseWhoLine('[51  Human Mtl] (Steward)(Newrealm) Somebody')).toMatchObject({ org: 'Newrealm' });
  });

  it('skips adjacent status flags instead of calling them a kingdom', () => {
    // synthetic: adjacent flags
    expect(parseWhoLine('[51  Human Mtl] (WANTED)(Hostile) Somebody')).toMatchObject({
      org: '',
      orgType: '',
      rest: 'Somebody',
    });
  });

  it('a status flag touching the kingdom does not become the kingdom', () => {
    // synthetic: (NT) followed directly by (WANTED)
    expect(parseWhoLine('[51  Human Mtl] (NT)(WANTED) Somebody')).toMatchObject({
      org: 'NT',
      orgType: 'kingdom',
      rest: 'Somebody',
    });
  });
});

describe('parseWhoLine: clan rosters (class-only stat block)', () => {
  it('reads a roster line with no race column', () => {
    expect(parseWhoLine('[51 Mtl] [ Slayers ]         Faelondir    Initiate')).toEqual({
      level: 51,
      race: '',
      class: 'Mtl',
      org: 'Slayers',
      orgType: 'clan',
      rest: 'Faelondir    Initiate',
    });
  });

  it('reads the new classes Avenger (Avg) and Chaos Weaver (CWv), and a level above 51', () => {
    expect(parseWhoLine('[51 CWv] [ Chaos ]           Deteryd      Lord             (Recruiter)')).toMatchObject({
      class: 'CWv',
      org: 'Chaos',
    });
    expect(
      parseWhoLine('[70 Avg] [ Chaos ]           Scorn        Watcher          (Leader) (Recruiter)'),
    ).toMatchObject({
      level: 70,
      class: 'Avg',
    });
  });

  it('a trailing * inside the clan bracket is the prestige marker; the clan is still the clan', () => {
    expect(
      parseWhoLine('[51 Skn] [ Chaos* ]          Crelius      Everchosen       (Leader) (Recruiter)'),
    ).toMatchObject({
      org: 'Chaos',
      orgType: 'clan',
    });
    expect(
      parseWhoLine('[51 Skn] [ Shadow*]          Telthian     Sovereign        (Leader) (Recruiter)'),
    ).toMatchObject({
      org: 'Shadow',
    });
    expect(
      parseWhoLine('[51  Human Skn] [ Shadow*] (WANTED) Telthian Schwartz,     Herald of the Umbratide'),
    ).toMatchObject({
      org: 'Shadow',
      rest: 'Telthian Schwartz,     Herald of the Umbratide',
    });
  });

  it('a prestige * inside the kingdom parentheses is dropped too (synthetic: none sampled in the corpus)', () => {
    expect(parseWhoLine('[51  Human Arm] (Nordmaar*) King Somebody')).toMatchObject({
      org: 'Nordmaar',
      orgType: 'kingdom',
      rest: 'King Somebody',
    });
    expect(parseWhoLine('[51  Human Arm] ( NT* ) Somebody')).toMatchObject({ org: 'NT', orgType: 'kingdom' });
    expect(parseWhoLine('[51 Kender Wit] (Queen)(Verminasia*) Somebody')).toMatchObject({ org: 'Verminasia' });
  });

  it('a * anywhere else in the line is title decoration: it does not touch the affiliation or end up in it', () => {
    expect(
      parseWhoLine('[51  Human Arm] (Nordmaar) King Riaghan MacCallum,    [Winter Hawk] [*****] [Raije]'),
    ).toMatchObject({
      org: 'Nordmaar',
      orgType: 'kingdom',
      rest: 'King Riaghan MacCallum,    [Winter Hawk] [*****] [Raije]',
    });
    expect(parseWhoLine('[51  D-Dwf Pri] [ Wargar ] Deacon Ozbourne "The Anvil\' Hammerstein VIII [*]')).toMatchObject({
      org: 'Wargar',
      orgType: 'clan',
    });
    expect(
      parseWhoLine('[51  Wemic Slr] [ Slayers ] Beezlebub,  Big Game Hunter                  <<=*=>>'),
    ).toMatchObject({
      org: 'Slayers',
    });
  });

  it('reads a roster line for a clan the game prints in parentheses', () => {
    expect(parseWhoLine('[42 Dra] ( Dragon )          Uriol        Member')).toMatchObject({
      race: '',
      class: 'Dra',
      org: 'Dragon',
      orgType: 'clan',
    });
  });
});

describe('parseWhoLine: clans printed in parentheses', () => {
  it.each([
    ['[51 Crystl Dra] ( Dragon ) (WANTED) Nuremaldron the Omnilescent.', 'Dragon'],
    ['[51  Hd Balanx] ( Balanx ) Zyphros, Chronicler of Kwainin (Keeper of the Scales)', 'Balanx'],
    ["[51  Arch Ang ] ( Angel ) Raphiel, Commander of Heaven's Host", 'Angel'],
    ['[51  Human Dem] ( Demon ) Somebody', 'Demon'], // synthetic: the game prints Demon this way too, line not sampled
  ])('%s is the clan %s, not a kingdom', (line, org) => {
    expect(parseWhoLine(line)).toMatchObject({ org, orgType: 'clan' });
  });

  it('a real kingdom in parentheses stays a kingdom', () => {
    expect(parseWhoLine('[51  Human Arm] (NT) Knight Ozzuluck')).toMatchObject({ org: 'NT', orgType: 'kingdom' });
  });
});

describe('parseWhoLine: lines that are not who lines', () => {
  it('refuses a line whose structure it cannot read, rather than calling it "no affiliation"', () => {
    expect(parseWhoLine('[51 Lepori Dru] [(VR) General Tamello de Fformelo Tussock (Warden) (LP)')).toBeNull();
  });

  it('returns null for an area-list row, whose [ 0] is a count and not a clan', () => {
    expect(parseWhoLine('[ 5 35] [ 0] Haon Daran                  [Jenikki                  ]')).toBeNull();
    expect(parseWhoLine('[ 1 51] [ 0] The Coliseum of Death       [Scorn Enthor Diavo Jelica]')).toBeNull();
  });

  it('returns null for ordinary text and prompts', () => {
    expect(parseWhoLine('No one of that name is playing.')).toBeNull();
    expect(parseWhoLine('You drink water from a decanter of endless water.')).toBeNull();
    expect(parseWhoLine('<1645/1645hp 962/1240m 406/406mv>')).toBeNull();
    expect(parseWhoLine('[Exits: north south]')).toBeNull();
  });

  it('returns null for a `gr` group row, which has the same [lvl class] start', () => {
    expect(parseWhoLine('[51 Skn] Kabal             79% hp  55% mana 100% mv')).toBeNull();
    expect(parseWhoLine('[51 Mob] a menacing felbeast  97% hp 100% mana 100% mv')).toBeNull();
  });
});

describe('whoLineMentionsName', () => {
  it('finds the name as a whole word anywhere in the title text, any case', () => {
    expect(whoLineMentionsName('Monsignor Patron Tief     (Turpa)', 'Tief')).toBe(true);
    expect(whoLineMentionsName('Tiberius Caine, Acolyte of Shadow', 'tiberius')).toBe(true);
  });

  it('does not match inside a longer word or another name', () => {
    expect(whoLineMentionsName('Tiberius Caine, Acolyte of Shadow', 'Tib')).toBe(false);
    expect(whoLineMentionsName('Waaagh, the Fell-handed, Chaos Lord', 'Waak')).toBe(false);
    expect(whoLineMentionsName('Ezriannes Pet', 'Ezrianne')).toBe(false);
  });

  it('is false for an empty name and treats regex characters literally', () => {
    expect(whoLineMentionsName('anything', '')).toBe(false);
    expect(whoLineMentionsName('Pingu N. Noot.', 'N.')).toBe(true);
    expect(whoLineMentionsName('Pingu NX Noot', 'N.')).toBe(false);
  });
});

describe('affiliationKeys', () => {
  it('expands a long or short realm name to both forms, and leaves other names alone', () => {
    expect(affiliationKeys('NT')).toEqual(['new thalos', 'nt']);
    expect(affiliationKeys(' Verminasia ')).toEqual(['verminasia', 'vr']);
    expect(affiliationKeys('Shadow')).toEqual(['shadow']);
  });
});
