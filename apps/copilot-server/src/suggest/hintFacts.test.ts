// Copilot's regular use of the hint tiers: the room of the situation, its description from the recent lines, and the facts the prompt gets.
import { makeSituation } from '../testing/situations';
import type { HintEngine } from '../hints/engine';
import type { HintAnswer } from '../hints/types';
import { createHintFacts, formatHintFacts, roomFromSituation } from './hintFacts';

const answer = (over: Partial<HintAnswer> = {}): HintAnswer => ({ tier: 'instant', commands: ['look fountain', 'enter orb'], notes: ['one', 'two', 'three'], tried: ['learned', 'instant'], ms: 5, ...over });

describe('roomFromSituation', () => {
  it('takes the name, the exits and the sector from the game state and the description from the lines after the room name', () => {
    const situation = makeSituation({
      game: { room: { name: 'Market Square', sector: 'city', exits: ['N', 'E'] } },
      lines: ['You walk north.', 'Market Square', '', 'A busy square.', 'A fountain splashes.', '[Exits: north east]', 'A guard stands here.'],
    });
    expect(roomFromSituation(situation)).toEqual({ title: 'Market Square', exits: ['N', 'E'], sector: 'city', description: 'A busy square. A fountain splashes.' });
  });

  it('matches the room name without regard to case, and uses the last time it was printed', () => {
    const situation = makeSituation({ lines: ['market square', 'Old text.', '[Exits: north]', 'MARKET SQUARE', 'New text.', '[Exits: north]'] });
    expect(roomFromSituation(situation)?.description).toBe('New text.');
  });

  it('has no description when the lines do not show the room (but still the room)', () => {
    expect(roomFromSituation(makeSituation({ lines: ['You feel tired.'] }))).toEqual({ title: 'Market Square', exits: ['N', 'E'], sector: 'city' });
    expect(roomFromSituation(makeSituation({ lines: ['Market Square', '[Exits: north]'] }))).not.toHaveProperty('description');
  });

  it('cuts a very long description', () => {
    const situation = makeSituation({ lines: ['Market Square', 'x'.repeat(250), ...Array.from({ length: 30 }, () => 'y'.repeat(250)), '[Exits: n]'] });
    expect(roomFromSituation(situation)?.description).toHaveLength(2000);
  });

  it('is undefined with no room, a blank room name, or a fight in progress', () => {
    expect(roomFromSituation(makeSituation({ game: { room: undefined } }))).toBeUndefined();
    expect(roomFromSituation(makeSituation({ game: { room: { name: '  ', sector: 'city', exits: [] } } }))).toBeUndefined();
    expect(roomFromSituation(makeSituation({ game: { inFight: true } }))).toBeUndefined();
  });
});

describe('formatHintFacts', () => {
  it('names the tier that answered, lists the commands and gives at most two notes', () => {
    expect(formatHintFacts(answer())).toEqual(['Hint (instant): look fountain | enter orb', 'Hint note: one', 'Hint note: two']);
    expect(formatHintFacts(answer({ tier: 'learned', notes: [] }))).toEqual(['Hint (taught): look fountain | enter orb']);
    expect(formatHintFacts(answer({ tier: 'local' }))[0]).toBe('Hint (local model): look fountain | enter orb');
  });

  it('says nothing for an answer with no commands, except that a ticket was filed', () => {
    expect(formatHintFacts(answer({ commands: [], tier: 'none' }))).toEqual([]);
    expect(formatHintFacts(answer({ commands: [], tier: 'escalated' }))).toEqual([expect.stringContaining('a ticket was filed')]);
  });
});

describe('createHintFacts', () => {
  it('asks the engine for the room of the situation, and gives its facts', async () => {
    const hint = jest.fn(async () => answer());
    const facts = await createHintFacts({ hint } as unknown as HintEngine)(makeSituation(), undefined);
    expect(facts[0]).toBe('Hint (instant): look fountain | enter orb');
    expect(hint).toHaveBeenCalledWith(expect.objectContaining({ title: 'Market Square' }), undefined);
  });

  it('asks nothing in a fight or with no room', async () => {
    const hint = jest.fn(async () => answer());
    const make = createHintFacts({ hint } as unknown as HintEngine);
    expect(await make(makeSituation({ game: { inFight: true } }))).toEqual([]);
    expect(hint).not.toHaveBeenCalled();
  });
});
