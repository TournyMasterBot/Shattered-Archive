import { classifyStepLine, manualCommandKind, slowStepFor } from './autoleveling-step-waits';

describe('slowStepFor', () => {
  it('finds the rule for heel and for ride with any steed keyword, ignoring case and spacing', () => {
    expect(slowStepFor('heel')?.label).toBe('heel');
    expect(slowStepFor('  HEEL ')?.label).toBe('heel');
    expect(slowStepFor('ride st')?.label).toBe('ride');
    expect(slowStepFor('ride steed')?.label).toBe('ride');
  });

  it('leaves moves, looks and other steps on the fixed settle', () => {
    for (const cmd of ['n', 'look', 'pull flinger', 'open south', 'heels', 'ride', 'dismount', '', undefined as unknown as string]) {
      expect(slowStepFor(cmd)).toBeNull();
    }
  });

  it('pauses the run when a ride goes wrong, but only notes a heel that went unanswered', () => {
    expect(slowStepFor('ride st')?.onMiss).toBe('pause');
    expect(slowStepFor('heel')?.onMiss).toBe('continue');
  });
});

describe('classifyStepLine', () => {
  const heel = slowStepFor('heel')!;
  const ride = slowStepFor('ride st')!;

  it.each([
    ['An unholy steed comes running in.', 'done'],
    ['An unholy steed gallops in.', 'done'],
    ['You are already riding your pet... why would you want to call them??', 'done'],
    ['No way!  You are still fighting!', 'failed'],
    ['You let out a loud whistle.', null],
    ['A gnome stone excavator walks in.', null],
  ] as const)('heel: %s', (line, expected) => expect(classifyStepLine(heel, line)).toBe(expected));

  it.each([
    ['You mount an unholy steed.', 'done'],
    ['Your already riding a mount!', 'done'],
    ["They're not here.", 'failed'],
    ["You can't ride that.", 'failed'],
    ['You can not ride anything while flying.', 'failed'],
    ['An unholy steed gallops in.', null],
    ['Ok.', null],
  ] as const)('ride: %s', (line, expected) => expect(classifyStepLine(ride, line)).toBe(expected));

  it('reads through colour codes and blank lines', () => {
    expect(classifyStepLine(ride, '\x1b[1;32mYou mount an unholy steed.\x1b[0m')).toBe('done');
    expect(classifyStepLine(ride, '   ')).toBeNull();
  });
});

describe('manualCommandKind', () => {
  it('knows the player casting with c or cast, and the slow steps', () => {
    expect(manualCommandKind('c haste')).toEqual({ kind: 'cast' });
    expect(manualCommandKind("cast 'sanctuary' tiberius")).toEqual({ kind: 'cast' });
    expect(manualCommandKind('ride st')).toMatchObject({ kind: 'rule' });
    expect(manualCommandKind('heel')).toMatchObject({ kind: 'rule' });
  });

  it('ignores anything that does not keep the game busy', () => {
    for (const cmd of ['whoc', 'imp', 'l', 'n', 'kill fur', 'cat', 'c', '', undefined as unknown as string]) {
      expect(manualCommandKind(cmd)).toBeNull();
    }
  });
});
