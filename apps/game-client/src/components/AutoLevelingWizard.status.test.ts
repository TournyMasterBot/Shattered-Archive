import { toRunStateText } from './AutoLevelingWizard';

describe('the run state shown in the wizard header', () => {
  it('says why the engine paused itself after a timeout', () => {
    expect(toRunStateText({ status: 'paused', reason: 'timeout', message: 'no reply to "n"' })).toBe('Paused: no reply to "n". Press Resume to continue.');
  });

  it('falls back to a plain reason when a timeout pause carries no message', () => {
    expect(toRunStateText({ status: 'paused', reason: 'timeout' })).toBe('Paused: no reply from the game. Press Resume to continue.');
  });

  it('does not double the full stop when the reason already ends with one', () => {
    expect(toRunStateText({ status: 'paused', reason: 'timeout', message: 'the fight did not end.' })).toBe(
      'Paused: the fight did not end. Press Resume to continue.',
    );
  });

  it('keeps the round for a pause that has one, and says just Paused when it has none', () => {
    expect(toRunStateText({ status: 'paused', round: 3 })).toBe('Paused (round 3)');
    expect(toRunStateText({ status: 'paused', reason: 'user' })).toBe('Paused');
    expect(toRunStateText({ status: 'paused', reason: 'flee' })).toBe('Paused');
  });

  it('other states are unchanged', () => {
    expect(toRunStateText({ status: 'error', message: 'stuck' })).toBe('Error: stuck');
    expect(toRunStateText({ status: 'running', round: 2, step: 'move', actionIndex: 0 })).toBe('Moving (round 2)');
    expect(toRunStateText({ status: 'idle' })).toBe('Not running');
  });
});
