import { computeStatusPieces, type CharDataAncillary } from './useCharData';

const BASE: CharDataAncillary = {
  carryWeight: null,
  carryWeightMax: null,
  carryWeightPct: null,
  isQuiet: false,
  isFlying: false,
  isRiding: false,
  isFighting: false,
  language: null,
};

describe('computeStatusPieces', () => {
  it('returns nothing when nothing is notable', () => {
    expect(computeStatusPieces(BASE)).toEqual([]);
  });

  it('includes carry weight when all three fields are present', () => {
    const pieces = computeStatusPieces({ ...BASE, carryWeight: 50, carryWeightMax: 100, carryWeightPct: 50 });
    expect(pieces).toEqual([{ key: 'carry', text: '🧺 50 / 100 (50%)', title: 'Carry weight: 50 / 100 (50%)' }]);
  });

  it('omits carry weight when any of the three fields is missing', () => {
    expect(computeStatusPieces({ ...BASE, carryWeight: 50, carryWeightMax: null, carryWeightPct: 50 })).toEqual([]);
  });

  it('includes one piece per active flag', () => {
    const pieces = computeStatusPieces({ ...BASE, isQuiet: true, isFlying: true, isRiding: true, isFighting: true });
    expect(pieces.map((p) => p.key)).toEqual(['quiet', 'flying', 'riding', 'fighting']);
  });

  it('includes language only when it is not Common', () => {
    expect(computeStatusPieces({ ...BASE, language: 'Common' })).toEqual([]);
    expect(computeStatusPieces({ ...BASE, language: 'Elvish' })).toEqual([
      { key: 'language', text: '💬 Elvish', title: 'Language: Elvish' },
    ]);
  });

  it('is case-insensitive when checking for Common', () => {
    expect(computeStatusPieces({ ...BASE, language: 'common' })).toEqual([]);
  });
});
