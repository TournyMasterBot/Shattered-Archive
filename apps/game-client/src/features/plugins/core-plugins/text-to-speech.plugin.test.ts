import * as fs from 'fs';
import * as path from 'path';
import {
  classifyEnemyAffliction,
  classifySpeechCategory,
  isBattleLine,
  isCommunicationLine,
  matchesCommandGate,
  maxUtteranceCharsFor,
  resolveSpeechToggles,
  roomRenderStartIndex,
  togglesForLegacyMode,
  speechSecondsFor,
  splitForSpeech,
  DEFAULT_COMMAND_GATE_PATTERNS,
} from './text-to-speech.plugin';

/**
 * The utterance cap exists to keep a single utterance inside Chrome/Edge's ~15s
 * stall window. That window is TIME, so the cap has to move with `rate` — the
 * bug these pin is a cap that models rate 1 and is silently wrong everywhere else.
 */
describe('maxUtteranceCharsFor', () => {
  it('keeps an unassisted utterance under the ~15s stall at every rate', () => {
    for (const rate of [0.5, 1, 1.5, 2, 3, 10]) {
      const cap = maxUtteranceCharsFor(rate, false);
      expect(speechSecondsFor('x'.repeat(cap), rate)).toBeLessThan(15);
    }
  });

  it('scales with rate — faster speech fits more text in the same window', () => {
    expect(maxUtteranceCharsFor(2, false)).toBeGreaterThan(maxUtteranceCharsFor(1, false));
    expect(maxUtteranceCharsFor(0.5, false)).toBeLessThan(maxUtteranceCharsFor(1, false));
  });

  it('allows a room-description-sized utterance once the keepalive is on', () => {
    // The point of the keepalive: ~1000 chars in one flowing utterance at rate 1.
    expect(maxUtteranceCharsFor(1, true)).toBeGreaterThanOrEqual(900);
    expect(maxUtteranceCharsFor(1, true)).toBeGreaterThan(maxUtteranceCharsFor(1, false));
  });

  it('floors the cap so a very slow rate still yields a usable chunk', () => {
    // Scaling proportionally all the way down would cap rate 0.1 at ~20 chars and
    // shred every sentence into fragments — a different kind of unlistenable.
    expect(maxUtteranceCharsFor(0.1, false)).toBeGreaterThanOrEqual(80);
  });

  it('falls back to rate 1 for junk rates rather than producing NaN or 0', () => {
    // A cap of NaN makes `length > cap` false, so an unsplit 1200-char block goes
    // straight to the engine — the exact stall this guards against.
    for (const junk of [NaN, 0, -1, Infinity]) {
      const cap = maxUtteranceCharsFor(junk, false);
      expect(Number.isFinite(cap)).toBe(true);
      expect(cap).toBeGreaterThan(0);
    }
  });
});

describe('speechSecondsFor', () => {
  it('is proportional to length and inversely proportional to rate', () => {
    expect(speechSecondsFor('x'.repeat(360), 1)).toBeCloseTo(20, 5);
    expect(speechSecondsFor('x'.repeat(360), 2)).toBeCloseTo(10, 5);
  });

  it('treats a junk rate as rate 1', () => {
    expect(speechSecondsFor('x'.repeat(180), NaN)).toBeCloseTo(10, 5);
  });
});

describe('togglesForLegacyMode', () => {
  it('expands each old single mode into the switches that reproduce it', () => {
    expect(togglesForLegacyMode('battleFocus')).toEqual({
      exploration: false,
      battle: true,
      communication: false,
      incidental: true,
    });
    expect(togglesForLegacyMode('communication')).toEqual({
      exploration: false,
      battle: false,
      communication: true,
      incidental: true,
    });
  });

  it('expands "off" and anything unknown to everything on', () => {
    // 'off' meant "read everything". Any unreadable value should speak more, not
    // less — silently muting a category on migration looks like a broken plugin.
    const all = { exploration: true, battle: true, communication: true, incidental: true };
    expect(togglesForLegacyMode('off')).toEqual(all);
    expect(togglesForLegacyMode('all')).toEqual(all);
    for (const junk of [undefined, null, '', 'nonsense', 42]) {
      expect(togglesForLegacyMode(junk)).toEqual(all);
    }
  });

  it('keeps incidental on in every expansion', () => {
    // The old modes all spoke their catch-all bucket; migrating someone into
    // silence on unmatched lines would change behaviour they never asked to change.
    for (const mode of ['exploration', 'battleFocus', 'communication', 'all', 'off']) {
      expect(togglesForLegacyMode(mode).incidental).toBe(true);
    }
  });
});

describe('resolveSpeechToggles', () => {
  it('treats an absent key as on', () => {
    // A config saved before these switches existed carries none of them; defaulting
    // those to off would leave the plugin apparently mute until they were found.
    expect(resolveSpeechToggles({})).toEqual({
      exploration: true,
      battle: true,
      communication: true,
      incidental: true,
      arena: false,
    });
  });

  it('reads each switch independently', () => {
    const toggles = resolveSpeechToggles({ speakExploration: false, speakCommunication: false });
    expect(toggles.exploration).toBe(false);
    expect(toggles.communication).toBe(false);
    expect(toggles.battle).toBe(true);
    expect(toggles.incidental).toBe(true);
  });

  it('reads arena from the legacy boolean and the legacy mode value', () => {
    expect(resolveSpeechToggles({ arenaObserverMode: true }).arena).toBe(true);
    expect(resolveSpeechToggles({ speechMode: 'arena' }).arena).toBe(true);
    expect(resolveSpeechToggles({ arenaObserverMode: false }).arena).toBe(false);
  });
});

describe('classifySpeechCategory', () => {
  const roomDescription = 'Past two tall doors of rich dark wood is a room of great proportions.';

  it('treats anything inside a room-look render as exploration', () => {
    expect(classifySpeechCategory(roomDescription, true)).toBe('exploration');
    expect(classifySpeechCategory('     A wide circular table heaped with books.', true)).toBe('exploration');
  });

  it('does not treat the same prose as exploration outside a render', () => {
    // The text carries no marker of its own — the block state is the whole signal.
    expect(classifySpeechCategory(roomDescription, false)).toBe('incidental');
  });

  it('classifies chat as communication even mid-render', () => {
    // Someone gossiping while you look does not become room content.
    const line = "Joat gossips 'anyone selling a longsword?'";
    expect(isCommunicationLine(line)).toBe(true);
    expect(classifySpeechCategory(line, true)).toBe('communication');
    expect(classifySpeechCategory(line, false)).toBe('communication');
  });

  it('classifies combat lines as battle outside a render', () => {
    const line = 'Grumbly is knocked to the ground by a rusty sword.';
    expect(isBattleLine(line)).toBe(true);
    expect(classifySpeechCategory(line, false)).toBe('battle');
  });

  it('puts unrecognised and ambient lines in incidental', () => {
    expect(classifySpeechCategory('You focus your training on cure light.', false)).toBe('incidental');
    expect(classifySpeechCategory('Your knowledge of dodge improves to 42%.', false)).toBe('incidental');
    expect(classifySpeechCategory('The waves crash upon the shore while gulls scream overhead', false)).toBe('incidental');
  });
});

describe('classifyEnemyAffliction', () => {
  it('announces the Stunning weapon-flag knockdown', () => {
    // The headline case: this is a weapon-flag proc, so Battle Focus squelched it
    // as noise and never spoke the single most useful line on the feed.
    expect(classifyEnemyAffliction('Grumbly is knocked to the ground by a rusty sword.')).toEqual({
      subject: 'Grumbly',
      effect: 'stunned',
      kind: 'debuff',
    });
  });

  it.each([
    // Lost rounds
    ['a large ogre is sent flying by the impact!', 'a large ogre', 'bashed'],
    ["the city guard's muscles stop responding.", 'the city guard', 'paralyzed'],
    ['Grumbly is slammed directly in the face!', 'Grumbly', 'stunned'],
    // Degraded offence
    ['a large ogre is blinded by the dirt in his eyes!', 'a large ogre', 'blinded'],
    ['Pardo is blinded by the spit in his eyes!', 'Pardo', 'blinded'],
    ['Grumbly starts to move in slow motion.', 'Grumbly', 'slowed'],
    // Degraded defence / sustain
    ['Grumbly is surrounded by a pink outline.', 'Grumbly', 'outlined in faerie fire'],
    ['Grumbly is poisoned by the venom on a rusty dagger.', 'Grumbly', 'poisoned'],
    ['the city guard looks very ill.', 'the city guard', 'plagued'],
    ['Grumbly looks very weak as their ability to heal is drained.', 'Grumbly', 'unable to heal'],
  ])('classifies the debuff in %s', (line, subject, effect) => {
    expect(classifyEnemyAffliction(line)).toEqual({ subject, effect, kind: 'debuff' });
  });

  it.each([
    ['Grumbly is surrounded by a white aura.', 'Grumbly', 'protected by sanctuary'],
    ["Grumbly's skin turns to stone.", 'Grumbly', 'stone skinned'],
    ['Grumbly is moving more quickly.', 'Grumbly', 'hasted'],
    ['A mystical shield glimmers as it surrounds a disinterested yinn warrior body.', 'a disinterested yinn warrior', 'shielded against magic'],
    ['An earth elemental regains free will.', 'An earth elemental', 'free of charm'],
  ])('classifies the buff in %s', (line, subject, effect) => {
    // Buffs on your opponent were previously dropped wholesale as "not afflictions".
    // Sanctuary halves your damage — not knowing is how a fight quietly stops working.
    expect(classifyEnemyAffliction(line)).toEqual({ subject, effect, kind: 'buff' });
  });

  it.each([
    ['an animal spirit tosses Rithor into the air!', 'Rithor', 'thrown into the air'],
    ['Melchaleve disarms the city guard!', 'the city guard', 'disarmed'],
  ])('reads the victim from the SECOND capture in %s', (line, subject, effect) => {
    // These name the ACTOR first. Taking group 1 would announce the animal spirit
    // or the attacker as the thing that got hit.
    expect(classifyEnemyAffliction(line)).toEqual({ subject, effect, kind: 'debuff' });
  });

  it('says nothing about someone poisoning their own blade', () => {
    // The lifebane "coats" line reads "<player> coats <weapon>", NOT
    // "<weapon> coats <victim>" as both the reference doc and PatternMap had it.
    // Nobody is afflicted; announcing the dagger as poisoned is true and useless.
    expect(
      classifyEnemyAffliction('Karotte coats a grand arcanium dagger with deadly lifebane poison.'),
    ).toBeUndefined();
  });

  it('does not mistake a sentence fragment for a combatant', () => {
    // The plague landing also arrives combined as "X shivers and looks very ill.";
    // an unanchored pattern captured "shivers and" and announced it as a target.
    expect(classifyEnemyAffliction('Grumbly looks very ill.')).toEqual({
      subject: 'Grumbly',
      effect: 'plagued',
      kind: 'debuff',
    });
    expect(classifyEnemyAffliction('. shivers and looks very ill.')).toBeUndefined();
  });

  it('names the victim, not the item, on the shield-disarm line', () => {
    expect(
      classifyEnemyAffliction('Melchaleve has an arcanium shield knocked loose from their hands by Archal!'),
    ).toEqual({ subject: 'Melchaleve', effect: 'stripped of their shield', kind: 'debuff' });
  });

  it('stays silent on per-round damage ticks', () => {
    // Corpus-verified and deliberately NOT admitted: these re-echo every round for
    // the affect's whole duration ("shivers and suffers" alone has 6,385 corpus
    // hits). The landing is the news; the tick is that news on repeat until the
    // fight ends, and it would bury everything else on the channel.
    expect(classifyEnemyAffliction('Grumbly shivers and suffers.')).toBeUndefined();
    expect(classifyEnemyAffliction('Grumbly writhes in agony as plague sores erupt from its skin.')).toBeUndefined();
  });

  it('stays silent on effects whose battle impact cannot be stated', () => {
    // Corpus-verified (241 hits) and still excluded: what a warcry mechanically
    // does to the fight is unclear, so announcing it is noise in a signal's coat.
    expect(classifyEnemyAffliction('Grumbly screams a massive warcry!')).toBeUndefined();
  });

  it('ignores your own afflictions, which have their own announcement path', () => {
    expect(classifyEnemyAffliction('You are knocked to the ground by a rusty sword.')).toBeUndefined();
    expect(classifyEnemyAffliction('You are sent flying by the impact!')).toBeUndefined();
  });

  it('still announces a third party whose name begins with "Your"', () => {
    // A `^your\b` self-guard would swallow this; the subject is a real combatant.
    expect(classifyEnemyAffliction('Your pet is knocked to the ground by a rusty sword.')).toEqual({
      subject: 'Your pet',
      effect: 'stunned',
      kind: 'debuff',
    });
  });

  it('ignores ordinary combat traffic', () => {
    expect(classifyEnemyAffliction('Grumbly hits you.')).toBeUndefined();
    expect(classifyEnemyAffliction("You dodge Grumbly's attack.")).toBeUndefined();
    expect(classifyEnemyAffliction('')).toBeUndefined();
  });
});

/**
 * A command gate silences everything for a window, so a false positive is far
 * more damaging than a miss: it drops combat lines with no visible cause and no
 * record. These pin the anchoring that prevents that.
 */
describe('matchesCommandGate', () => {
  const D = DEFAULT_COMMAND_GATE_PATTERNS;

  it('gates the bare command and the numbered form the defaults describe', () => {
    expect(matchesCommandGate('map', D)).toBe(true);
    expect(matchesCommandGate('map 3', D)).toBe(true);
    expect(matchesCommandGate('map 12', D)).toBe(true);
  });

  it('is anchored, so it never fires on a command that merely contains one', () => {
    // The whole reason this is not a substring match. Each of these would
    // otherwise blank half a second of speech for no reason the user can see.
    for (const input of ['unmap', 'maple', 'remap', 'say the map is wrong', 'mapper']) {
      expect(matchesCommandGate(input, D)).toBe(false);
    }
  });

  it('ignores case and surrounding whitespace, like the game does', () => {
    expect(matchesCommandGate('MAP', D)).toBe(true);
    expect(matchesCommandGate('  Map 4  ', D)).toBe(true);
  });

  it('collapses internal whitespace so the plain default still fires', () => {
    // Without this, `map \d+` silently misses `map   3` and the feature looks
    // broken for a reason nobody would guess.
    expect(matchesCommandGate('map   3', D)).toBe(true);
  });

  it('does not gate an argument the pattern did not describe', () => {
    // `map \d+` is digits. `map north` is a different command shape and may well
    // produce speakable output.
    expect(matchesCommandGate('map north', D)).toBe(false);
  });

  it('supports a deliberate prefix match when the user asks for one', () => {
    expect(matchesCommandGate('map north', 'map.*')).toBe(true);
    expect(matchesCommandGate('unmap', 'map.*')).toBe(false);
  });

  it('falls back to exact equality for an entry that will not compile', () => {
    // Dropping an uncompilable line would silently disable a gate the user
    // believes is configured; matching it literally at least honours the intent.
    expect(matchesCommandGate('map(', 'map(')).toBe(true);
    expect(matchesCommandGate('map', 'map(')).toBe(false);
  });

  it('ignores blanks and # comments so the list can be annotated', () => {
    expect(matchesCommandGate('map', '# the map grid\n\nmap\n')).toBe(true);
    expect(matchesCommandGate('anything', '# only a comment')).toBe(false);
  });

  it('never gates empty input, whatever the patterns say', () => {
    // An empty pattern entry compiled unanchored would match everything; an
    // empty input must not be gated by a stray blank line either.
    expect(matchesCommandGate('', D)).toBe(false);
    expect(matchesCommandGate('   ', '\n\n')).toBe(false);
  });

  it('gates nothing when the list is empty', () => {
    for (const empty of ['', '   ', '\n']) {
      expect(matchesCommandGate('map', empty)).toBe(false);
    }
  });
});

/**
 * Room-render detection, pinned against REAL captured traffic.
 *
 * The fixture is verbatim output from the docker game-server jsonl corpus — each
 * case is the text emitted since the previous prompt, plus the room name the
 * room_data event behind it carried. Nothing is hand-written, because both bugs
 * this guards against came from believing a plausible story instead of measuring:
 *
 *  1. room_data does NOT mark a render. It fires before every prompt; only ~9% of
 *     341,481 corpus events follow one. The NAME discriminates, not the event.
 *  2. The title is often NOT the first line. Anchoring on lines[0] missed 6,170 of
 *     37,997 real renders (16.2% — one room in six) because portal echoes, wake-up
 *     messages, escape flavor and interleaved chat all land ahead of it.
 */
describe('roomRenderStartIndex (real docker log corpus)', () => {
  const fixture = JSON.parse(
    // __dirname, never cwd — jest is invoked from several working directories here.
    fs.readFileSync(path.join(__dirname, '__fixtures__', 'room-render-corpus.json'), 'utf8'),
  ) as {
    cases: Array<{ command: string; room: string; lines: string[]; renderStart: number; source: string }>;
  };

  const renders = fixture.cases.filter((c) => c.renderStart >= 0);
  const prefixed = fixture.cases.filter((c) => c.renderStart > 0);
  const others = fixture.cases.filter((c) => c.renderStart < 0);

  it('covers all three shapes of real traffic', () => {
    // Guards the fixture itself. A regeneration that captured only plain renders
    // would make the regression cases below vacuously pass — which is exactly how
    // the 16% miss went unnoticed the first time.
    expect(renders.length).toBeGreaterThanOrEqual(4);
    expect(prefixed.length).toBeGreaterThanOrEqual(3);
    expect(others.length).toBeGreaterThanOrEqual(4);
  });

  it.each(fixture.cases.map((c) => [`${c.room} after ${JSON.stringify(c.command)}`, c] as const))(
    'finds the render start in: %s',
    (_label, c) => {
      expect(roomRenderStartIndex(c.lines, c.room)).toBe(c.renderStart);
    },
  );

  it.each(prefixed.map((c) => [c.lines[0].slice(0, 45), c] as const))(
    'still finds the render behind the prefix line "%s…"',
    (_first, c) => {
      // THE REGRESSION. Every one of these is a real room render whose title is
      // not the first line, and the previous first-line anchor scored all of them
      // as "not a render" — leaking the whole description past the toggle.
      const idx = roomRenderStartIndex(c.lines, c.room);
      expect(idx).toBeGreaterThan(0);
      expect(c.lines[idx]).toBe(c.room);
    },
  );

  it('leaves the prefix out of the render so it keeps its own category', () => {
    // "You enter a dark glowing orb." is how you learn the portal worked. It is
    // not room description, and silencing exploration must not silence it.
    for (const c of prefixed) {
      const idx = roomRenderStartIndex(c.lines, c.room);
      expect(c.lines.slice(0, idx)).not.toContain(c.room);
      expect(c.lines.slice(idx)[0]).toBe(c.room);
    }
  });

  it.each(others.map((c) => [c.lines[0].slice(0, 45), c] as const))(
    'reports no render for "%s…"',
    (_first, c) => {
      expect(roomRenderStartIndex(c.lines, c.room)).toBe(-1);
    },
  );

  it('takes the LAST title when a window holds several renders', () => {
    // River drift and speedwalks put multiple renders in one window; the event
    // describes the room you ENDED in, so the earlier titles are not its start.
    const lines = ['Through the rapids', '[Exits: west  ]', 'You are shoved west!', 'The Ocean Floor', 'Sand stretches away.'];
    expect(roomRenderStartIndex(lines, 'The Ocean Floor')).toBe(3);
  });

  it('matches the whole line only, never a mention inside one', () => {
    // A chat line quoting a room name must not open a render.
    const room = 'The Library of Storm Keep';
    expect(roomRenderStartIndex(['You walk into The Library of Storm Keep.'], room)).toBe(-1);
    expect(roomRenderStartIndex(["Kevyn gossips 'meet me at The Library of Storm Keep'"], room)).toBe(-1);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(roomRenderStartIndex(['  chamber of REPOSE  '], 'Chamber of Repose')).toBe(0);
  });

  it('reports no render when nothing is held or no room name arrived', () => {
    // Both are live states: room_data fires before prompts with no preceding text
    // at all (12% of corpus events). An empty-in/empty-out match would confirm a
    // render on every one of them.
    expect(roomRenderStartIndex([], 'The Library of Storm Keep')).toBe(-1);
    expect(roomRenderStartIndex(['The Library of Storm Keep'], '')).toBe(-1);
    expect(roomRenderStartIndex([], '')).toBe(-1);
    expect(roomRenderStartIndex([''], '')).toBe(-1);
  });

  it('confirms every fixture render carries an exits line', () => {
    // The structural claim the detector leans on, checked against real text.
    for (const c of renders) {
      expect(c.lines[c.renderStart]).toBe(c.room);
      expect(c.lines.slice(c.renderStart).some((l) => /^\[Exits:.*\]$/.test(l))).toBe(true);
    }
  });
});

describe('splitForSpeech', () => {
  it('leaves text at or under the cap alone', () => {
    expect(splitForSpeech('Short line.', 200)).toEqual(['Short line.', '']);
  });

  it('prefers a sentence end, so the break is not audible mid-thought', () => {
    const [head, rest] = splitForSpeech('One. Two. Three that runs on and on.', 12);
    expect(head).toBe('One. Two.');
    expect(rest).toBe('Three that runs on and on.');
  });

  it('falls back to whitespace when no sentence end fits', () => {
    const [head, rest] = splitForSpeech('alpha beta gamma delta', 12);
    expect(head).toBe('alpha beta');
    expect(rest).toBe('gamma delta');
  });

  it('cuts mid-word only when a single token exceeds the cap', () => {
    const [head, rest] = splitForSpeech('supercalifragilistic', 10);
    expect(head).toHaveLength(10);
    expect(head + rest).toBe('supercalifragilistic');
  });

  it('reassembles losslessly apart from the whitespace it breaks on', () => {
    const text = 'The Library of Storm Keep. Past two tall doors of rich dark wood is a room of great proportions.';
    const [head, rest] = splitForSpeech(text, 40);
    expect(`${head} ${rest}`.replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '));
  });
});
