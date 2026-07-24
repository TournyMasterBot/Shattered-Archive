/**
 * SpellSpec model tests (Phase 14a): archetype/target compatibility, the closed
 * enums, and the fields that become raw C string literals / skills.dat lines.
 */
import { validateSpellSpec, TAR_CHAR_OFFENSIVE, TAR_CHAR_DEFENSIVE, TAR_CHAR_SELF, type SpellSpec } from './spell-spec';

function baseDamage(overrides: Partial<SpellSpec> = {}): SpellSpec {
  return {
    name: 'test bolt',
    funName: 'spell_test_bolt',
    archetype: 'damage',
    target: TAR_CHAR_OFFENSIVE,
    damage: { baseDiceCount: 6, perLevelDiv: 2, diceSize: 8, saveType: 'half', damageType: 'fire' },
    datDefaults: {
      levels: [10, 10, 10, 10],
      ratings: [1, 1, 1, 1],
      mana: 20,
      lag: 12,
      minPosition: 7,
      damageNoun: 'test bolt',
      msgOff: '!Test Bolt!',
    },
    ...overrides,
  };
}

describe('validateSpellSpec: clean specs', () => {
  it('accepts a well-formed damage spec', () => {
    const { errors, warnings } = validateSpellSpec(baseDamage(), { existingOverlayNames: new Set() });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('accepts a well-formed buff spec', () => {
    const spec = baseDamage({
      archetype: 'buff',
      target: TAR_CHAR_DEFENSIVE,
      damage: undefined,
      buff: {
        location: 'ac',
        modifierFlat: -20,
        durationFlat: 24,
        alreadyAffectedSelfMsg: 'You are already protected.',
        alreadyAffectedOtherMsg: '$N is already protected.',
        castMsg: 'You feel someone protecting you.',
      },
    });
    const { errors } = validateSpellSpec(spec, { existingOverlayNames: new Set() });
    expect(errors).toEqual([]);
  });

  it('accepts TAR_CHAR_SELF for a buff', () => {
    const spec = baseDamage({
      archetype: 'buff',
      target: TAR_CHAR_SELF,
      damage: undefined,
      buff: {
        location: 'hitroll',
        modifierPerLevelDiv: 8,
        durationLevelPlus: 6,
        alreadyAffectedSelfMsg: 'You already feel righteous.',
        alreadyAffectedOtherMsg: '$N already has divine favor.',
        castMsg: 'You feel righteous.',
      },
    });
    expect(validateSpellSpec(spec, { existingOverlayNames: new Set() }).errors).toEqual([]);
  });

  it('accepts a well-formed debuff spec', () => {
    const spec = baseDamage({
      archetype: 'debuff',
      target: TAR_CHAR_OFFENSIVE,
      damage: undefined,
      debuff: {
        location: 'hitroll',
        modifierFlat: -4,
        durationLevelPlus: 1,
        bitvector: 'blind',
        castMsgVictim: 'You are blinded!',
        castMsgRoom: '$n appears to be blinded.',
      },
    });
    expect(validateSpellSpec(spec, { existingOverlayNames: new Set() }).errors).toEqual([]);
  });

  it('accepts a well-formed heal spec', () => {
    const spec = baseDamage({
      archetype: 'heal',
      target: TAR_CHAR_DEFENSIVE,
      damage: undefined,
      heal: { diceCount: 1, diceSize: 8, levelDiv: 3 },
    });
    expect(validateSpellSpec(spec, { existingOverlayNames: new Set() }).errors).toEqual([]);
  });

  it('accepts a well-formed cure spec', () => {
    const spec = baseDamage({
      archetype: 'cure',
      target: TAR_CHAR_DEFENSIVE,
      damage: undefined,
      cure: { condition: 'blindness', notAffectedMsg: "You aren't blind." },
    });
    expect(validateSpellSpec(spec, { existingOverlayNames: new Set() }).errors).toEqual([]);
  });
});

describe('validateSpellSpec: archetype/target compatibility', () => {
  it('rejects a damage spec targeting TAR_CHAR_DEFENSIVE', () => {
    const { errors } = validateSpellSpec(baseDamage({ target: TAR_CHAR_DEFENSIVE }), { existingOverlayNames: new Set() });
    expect(errors.some((e) => e.includes('not valid for archetype'))).toBe(true);
  });

  it('rejects a debuff spec targeting TAR_CHAR_DEFENSIVE', () => {
    const spec = baseDamage({
      archetype: 'debuff',
      target: TAR_CHAR_DEFENSIVE,
      damage: undefined,
      debuff: {
        location: 'hitroll',
        modifierFlat: -4,
        durationLevelPlus: 1,
        bitvector: 'blind',
        castMsgVictim: 'x',
        castMsgRoom: 'y',
      },
    });
    expect(validateSpellSpec(spec, { existingOverlayNames: new Set() }).errors.some((e) => e.includes('not valid for archetype'))).toBe(
      true,
    );
  });

  it('requires a debuff bitvector (the guard is bitvector-based, unlike buff)', () => {
    const spec = baseDamage({
      archetype: 'debuff',
      target: TAR_CHAR_OFFENSIVE,
      damage: undefined,
      debuff: {
        location: 'hitroll',
        modifierFlat: -4,
        durationLevelPlus: 1,
        bitvector: undefined as unknown as 'blind',
        castMsgVictim: 'x',
        castMsgRoom: 'y',
      },
    });
    expect(validateSpellSpec(spec, { existingOverlayNames: new Set() }).errors.some((e) => e.includes('bitvector is required'))).toBe(
      true,
    );
  });

  it('allows a buff with no bitvector (armor-style: guard is is_affected(sn), not bitvector)', () => {
    const spec = baseDamage({
      archetype: 'buff',
      target: TAR_CHAR_DEFENSIVE,
      damage: undefined,
      buff: {
        location: 'ac',
        modifierFlat: -20,
        durationFlat: 24,
        alreadyAffectedSelfMsg: 'You are already protected.',
        alreadyAffectedOtherMsg: '$N is already protected.',
        castMsg: 'You feel protected.',
      },
    });
    expect(validateSpellSpec(spec, { existingOverlayNames: new Set() }).errors).toEqual([]);
  });
});

describe('validateSpellSpec: naming collisions', () => {
  it('rejects funName not matching spell_[a-z_]+', () => {
    const { errors } = validateSpellSpec(baseDamage({ funName: 'SpellTestBolt' }), { existingOverlayNames: new Set() });
    expect(errors.some((e) => e.includes('must match'))).toBe(true);
  });

  it('rejects funName colliding with the compiled fun_registry', () => {
    const { errors } = validateSpellSpec(baseDamage({ funName: 'spell_armor' }), { existingOverlayNames: new Set() });
    expect(errors.some((e) => e.includes('collides with the compiled fun_registry'))).toBe(true);
  });

  it('rejects funName colliding with another stored spec', () => {
    const { errors } = validateSpellSpec(baseDamage(), {
      existingOverlayNames: new Set(),
      existingFunNames: new Set(['spell_test_bolt']),
    });
    expect(errors.some((e) => e.includes('already used by another stored spec'))).toBe(true);
  });

  it('rejects a name colliding with a stock skill', () => {
    const { errors } = validateSpellSpec(baseDamage({ name: 'armor' }), { existingOverlayNames: new Set() });
    expect(errors.some((e) => e.includes('collides with a stock skill'))).toBe(true);
  });

  it('rejects a name colliding with an existing overlay row', () => {
    const { errors } = validateSpellSpec(baseDamage(), { existingOverlayNames: new Set(['test bolt']) });
    expect(errors.some((e) => e.includes('already used by an existing skills.dat overlay row'))).toBe(true);
  });
});

describe('validateSpellSpec: field bounds and string safety', () => {
  it('rejects dice bounds outside 0/1..50', () => {
    const spec = baseDamage({ damage: { baseDiceCount: 6, diceSize: 999, saveType: 'half', damageType: 'fire' } });
    expect(validateSpellSpec(spec, { existingOverlayNames: new Set() }).errors.some((e) => e.includes('diceSize'))).toBe(true);
  });

  it('rejects baseDiceCount 0 with no perLevelDiv (always zero dice)', () => {
    const spec = baseDamage({ damage: { baseDiceCount: 0, diceSize: 8, saveType: 'half', damageType: 'fire' } });
    expect(validateSpellSpec(spec, { existingOverlayNames: new Set() }).errors.some((e) => e.includes('always deals zero dice'))).toBe(
      true,
    );
  });

  it('accepts baseDiceCount 0 WITH perLevelDiv (spell_acid_blast shape)', () => {
    const spec = baseDamage({ damage: { baseDiceCount: 0, perLevelDiv: 1, diceSize: 12, saveType: 'half', damageType: 'acid' } });
    expect(validateSpellSpec(spec, { existingOverlayNames: new Set() }).errors).toEqual([]);
  });

  it('rejects a cast message containing a double quote (breaks the C string literal)', () => {
    const spec = baseDamage({
      archetype: 'buff',
      target: TAR_CHAR_DEFENSIVE,
      damage: undefined,
      buff: {
        location: 'ac',
        modifierFlat: -20,
        durationFlat: 24,
        alreadyAffectedSelfMsg: 'You are already "protected".',
        alreadyAffectedOtherMsg: '$N is already protected.',
        castMsg: 'ok',
      },
    });
    expect(validateSpellSpec(spec, { existingOverlayNames: new Set() }).errors.some((e) => e.includes('would break'))).toBe(true);
  });

  it('rejects msg_off of exactly "@" (the skills.dat NULL sentinel)', () => {
    const spec = baseDamage();
    spec.datDefaults.msgOff = '@';
    expect(validateSpellSpec(spec, { existingOverlayNames: new Set() }).errors.some((e) => e.includes('NULL sentinel'))).toBe(true);
  });

  it('rejects an empty name', () => {
    const spec = baseDamage({ name: '' });
    expect(validateSpellSpec(spec, { existingOverlayNames: new Set() }).errors.some((e) => e.includes('must not be empty'))).toBe(true);
  });

  it('warns (not errors) when a non-matching archetype field is also present', () => {
    const spec = baseDamage();
    spec.heal = { diceCount: 1, diceSize: 8 };
    const { errors, warnings } = validateSpellSpec(spec, { existingOverlayNames: new Set() });
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes('unused archetype'))).toBe(true);
  });
});
