import { scrub, UNKNOWN_NAME_PLACEHOLDER, type ScrubEntry } from './scrub';

/** Invented names only. */
const ENTRIES: ScrubEntry[] = [
  { name: 'Zorvak', replacement: 'Agate-M' },
  { name: 'Quenta', replacement: 'Orion-F' },
];

describe('scrub: registered names in every position (N1)', () => {
  it('replaces a name in a tell', () => {
    expect(scrub("Zorvak tells you 'meet me at the gate'", ENTRIES).text).toBe("Agate-M tells you 'meet me at the gate'");
  });

  it('replaces a name in a room line', () => {
    expect(scrub('Quenta the Wanderer is here, resting.', ENTRIES).text).toBe('Orion-F the Wanderer is here, resting.');
  });

  it('replaces a name in a whoisic header', () => {
    expect(scrub('IC Information for Zorvak.', ENTRIES).text).toBe('IC Information for Agate-M.');
  });

  it('replaces a name inside quoted speech and several times in one line', () => {
    expect(scrub('You say \'Thanks, Quenta. Tell Zorvak and quenta I said hi.\'', ENTRIES).text).toBe(
      "You say 'Thanks, Orion-F. Tell Agate-M and Orion-F I said hi.'",
    );
  });

  it('replaces case-insensitively', () => {
    expect(scrub('ZORVAK zorvak ZoRvAk', ENTRIES).text).toBe('Agate-M Agate-M Agate-M');
  });

  it('replaces a name that is a substring of a longer word (over-scrubbing is deliberate)', () => {
    expect(scrub('Zorvakian armour and the Quenta-ward', ENTRIES).text).toBe('Agate-Mian armour and the Orion-F-ward');
  });

  it('counts what it replaced', () => {
    expect(scrub('Zorvak and Quenta and zorvak', ENTRIES, { unknownNames: 'keep' })).toEqual({
      text: 'Agate-M and Orion-F and Agate-M',
      replaced: 3,
      unknown: 0,
    });
  });
});

describe('scrub: registry edge cases', () => {
  it('with an empty registry changes nothing registered and reports zero', () => {
    expect(scrub('Zorvak is here.', [], { unknownNames: 'keep' })).toEqual({ text: 'Zorvak is here.', replaced: 0, unknown: 0 });
  });

  it('ignores blank names and repeated names', () => {
    const result = scrub('Zorvak', [{ name: '  ', replacement: 'X' }, ...ENTRIES, { name: 'zorvak', replacement: 'Other-M' }]);
    expect(result.text).toBe('Agate-M');
  });

  it('replaces the longer name when one name contains the other', () => {
    const entries: ScrubEntry[] = [
      { name: 'Anna', replacement: 'Lyra-F' },
      { name: 'Annabel', replacement: 'Pavo-F' },
    ];
    expect(scrub('Annabel met Anna', entries).text).toBe('Pavo-F met Lyra-F');
  });

  it('matches a very short name only as a whole word', () => {
    const entries: ScrubEntry[] = [{ name: 'Al', replacement: 'Lynx-M' }];
    expect(scrub('Al waved at the Alchemist while a ball of Al fell', entries).text).toBe(
      'Lynx-M waved at the Alchemist while a ball of Lynx-M fell',
    );
  });

  it('still removes a name written with a look-alike letter that only case-folding matches (long s for s)', () => {
    // U+017F LATIN SMALL LETTER LONG S matches "s" under case-insensitive Unicode matching but lower-cases to itself, so the
    // exact lookup misses: the safe answer is the generic placeholder, never the original text.
    const result = scrub('ſorvak is here', [{ name: 'Sorvak', replacement: 'Lupus-M' }], { unknownNames: 'keep' });
    expect(result.text).toBe(`${UNKNOWN_NAME_PLACEHOLDER} is here`);
    expect(result.replaced).toBe(1);
  });

  it('maps a Kelvin sign (lower-cases to k) to the normal replacement', () => {
    const result = scrub('Kenneth is here', [{ name: 'Kenneth', replacement: 'Lupus-M' }], { unknownNames: 'keep' });
    expect(result.text).toBe('Lupus-M is here');
  });

  it('escapes regular-expression characters in a name', () => {
    expect(scrub('see O.Brien', [{ name: 'O.Brien', replacement: 'Leo-M' }]).text).toBe('see Leo-M');
    expect(scrub('see OxBrien', [{ name: 'O.Brien', replacement: 'Leo-M' }]).text).toBe('see OxBrien');
  });

  it('is idempotent, including for a name equal to the base of its own codename', () => {
    const entries: ScrubEntry[] = [{ name: 'Orion', replacement: 'Orion-M' }];
    const once = scrub('Orion waved. Orion-M is here.', entries).text;
    expect(once).toBe('Orion-M waved. Orion-M is here.');
    expect(scrub(once, entries).text).toBe(once);
  });

  it('is idempotent for ordinary names', () => {
    const once = scrub("Zorvak tells you 'hi'", ENTRIES).text;
    expect(scrub(once, ENTRIES).text).toBe(once);
  });

  it('never leaves a registered name behind, whatever the surrounding text', () => {
    const samples = [
      "Zorvak tells you 'x'",
      '[OOC] Quenta says x',
      'IC Information for ZORVAK.',
      'the zorvakquenta pair',
      'Zorvak\'s sword, Quenta\'s shield',
      'ZorvakZorvak',
    ];
    for (const sample of samples) {
      expect(scrub(sample, ENTRIES).text.toLowerCase()).not.toMatch(/zorvak|quenta/);
    }
  });
});

describe('scrub: unregistered name-shaped words (policy: redact)', () => {
  it('redacts the speaker of a tell and a channel line', () => {
    expect(scrub("Gwendolen tells you 'psst'", []).text).toBe(`${UNKNOWN_NAME_PLACEHOLDER} tells you 'psst'`);
    expect(scrub("[OOC] Gwendolen says 'hello'", []).text).toBe(`[OOC] ${UNKNOWN_NAME_PLACEHOLDER} says 'hello'`);
  });

  it('redacts the addressee of a tell and the name in a whoisic header', () => {
    expect(scrub("You tell Gwendolen 'ok'", []).text).toBe(`You tell ${UNKNOWN_NAME_PLACEHOLDER} 'ok'`);
    expect(scrub('You reply to Gwendolen ok', []).text).toBe(`You reply to ${UNKNOWN_NAME_PLACEHOLDER} ok`);
    expect(scrub('IC Information for Gwendolen.', []).text).toBe(`IC Information for ${UNKNOWN_NAME_PLACEHOLDER}.`);
  });

  it('redacts on every line of multi-line text and counts them', () => {
    const result = scrub("Gwendolen tells you 'a'\nThe guard says 'halt'\nBorin yells 'b'", []);
    expect(result.text).toBe(`${UNKNOWN_NAME_PLACEHOLDER} tells you 'a'\nThe guard says 'halt'\n${UNKNOWN_NAME_PLACEHOLDER} yells 'b'`);
    expect(result.unknown).toBe(2);
  });

  it('leaves words that are not names alone, in the positions where a name would be redacted', () => {
    const text = "Someone tells you 'x'\nNobody says 'y'\n[OOC] Everyone shouts 'z'\nYou tell Someone 'ok'";
    expect(scrub(text, [])).toEqual({ text, replaced: 0, unknown: 0 });
  });

  it('does not redact a name that is already a codename', () => {
    expect(scrub("Agate-F tells you 'x'", []).text).toBe("Agate-F tells you 'x'");
    expect(scrub('IC Information for Agate-F.', []).text).toBe('IC Information for Agate-F.');
  });

  it('keeps unregistered names when asked to', () => {
    expect(scrub("Gwendolen tells you 'x'", [], { unknownNames: 'keep' })).toEqual({
      text: "Gwendolen tells you 'x'",
      replaced: 0,
      unknown: 0,
    });
  });

  it('replaces a registered name first, so only the unknown one counts as unknown', () => {
    const result = scrub("Zorvak tells you 'x'\nGwendolen tells you 'y'", ENTRIES);
    expect(result).toEqual({
      text: `Agate-M tells you 'x'\n${UNKNOWN_NAME_PLACEHOLDER} tells you 'y'`,
      replaced: 1,
      unknown: 1,
    });
  });
});
