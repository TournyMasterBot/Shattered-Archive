import { fightSnapshot } from '../testing/fights';
import { makeSituation } from '../testing/situations';
import { buildWatcherPrompt, describeFight } from './prompt';
import type { Route } from './router';

const route: Route = { sphere: 'fighting', facts: [], lessons: [], tried: ['fighting'] };

describe('describeFight', () => {
  it('says nothing when there is no fight', () => {
    expect(describeFight(makeSituation())).toEqual([]);
    expect(describeFight(makeSituation({ fight: { ...fightSnapshot('winning'), active: false } }))).toEqual([]);
  });

  it('gives the numbers of a fight in a few lines, as estimates', () => {
    const text = describeFight(makeSituation({ mode: 'battle', fight: fightSnapshot('losing') })).join('\n');
    expect(text).toContain('FIGHT (computed from the log, current): against the ogre, round 2');
    expect(text).toContain('you: 70% hit points, losing about 15.0 per round; rounds until you die: about 5');
    expect(text).toContain('opponent: 90-99% of its hit points');
    expect(text).toContain('the monitor expects: losing; advice: flee');
  });

  it('says when the numbers were projected past the last event, and when there is too little data', () => {
    const projected = describeFight(makeSituation({ fight: fightSnapshot('losing', 2) })).join('\n');
    expect(projected).toContain('projected 2.0 rounds ahead');
    const early = fightSnapshot('winning');
    const thin = describeFight(makeSituation({ fight: { ...early, reliable: false, roundsToKill: null, roundsToDie: null, opponentCondition: undefined, hpPct: undefined, opponent: undefined } })).join('\n');
    expect(thin).toContain('an unknown opponent');
    expect(thin).toContain('hit points unknown');
    expect(thin).toContain('rounds until it dies: unknown');
    expect(thin).toContain('(too little data to trust)');
  });
});

describe('the watcher prompt', () => {
  it('carries the fight block and the rule never to attack what is not identified', () => {
    const prompt = buildWatcherPrompt(makeSituation({ mode: 'battle', game: { inFight: true }, fight: fightSnapshot('winning') }), route);
    expect(prompt).toContain('FIGHT (computed from the log');
    expect(prompt).toContain('Never attack a creature you have not identified');
    expect(buildWatcherPrompt(makeSituation(), route)).not.toContain('FIGHT (computed');
  });
});
