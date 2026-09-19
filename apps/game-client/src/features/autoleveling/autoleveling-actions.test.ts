// apps/game-client/src/features/autoleveling/autoleveling-actions.test.ts

import { parseActionsFromEditor, serializeActionsToEditor } from './autoleveling-actions';
import type { AutoLevelAction } from './autoleveling-types';

describe('autoleveling action editor parse/serialize', () => {
  it('parses a plain send', () => {
    expect(parseActionsFromEditor('kill rat')).toEqual([{ kind: 'send', cmd: 'kill rat' }]);
  });

  it('parses cooldown <sec> <cmd>', () => {
    expect(parseActionsFromEditor('cooldown 8 quaff blue')).toEqual([
      { kind: 'send_cooldown', cmd: 'quaff blue', cooldownSec: 8 },
    ]);
  });

  it('cooldown clamps a negative / non-numeric seconds to 0', () => {
    expect(parseActionsFromEditor('cooldown -3 bash')).toEqual([
      { kind: 'send_cooldown', cmd: 'bash', cooldownSec: 0 },
    ]);
    expect(parseActionsFromEditor('cooldown x kick')).toEqual([
      { kind: 'send_cooldown', cmd: 'kick', cooldownSec: 0 },
    ]);
  });

  it('round-trips a mixed fight script', () => {
    const text = ['cooldown 8 bash', 'cooldown 3 kick', 'cast fireball', 'wait_fighting true'].join('\n');
    const actions = parseActionsFromEditor(text);
    expect(actions).toEqual<AutoLevelAction[]>([
      { kind: 'send_cooldown', cmd: 'bash', cooldownSec: 8 },
      { kind: 'send_cooldown', cmd: 'kick', cooldownSec: 3 },
      { kind: 'send', cmd: 'cast fireball' },
      { kind: 'wait_fighting', value: true, timeoutMs: undefined },
    ]);
    // serialize -> parse is stable for the cooldown + send lines
    const reparsed = parseActionsFromEditor(serializeActionsToEditor(actions));
    expect(reparsed.slice(0, 3)).toEqual(actions.slice(0, 3));
  });

  it('serializes send_cooldown back to the cooldown syntax', () => {
    expect(serializeActionsToEditor([{ kind: 'send_cooldown', cmd: 'quaff blue', cooldownSec: 8 }])).toBe(
      'cooldown 8 quaff blue',
    );
  });

  it('parses every_ticks <n> <cmd>', () => {
    expect(parseActionsFromEditor('every_ticks 6 berserk')).toEqual([
      { kind: 'send_every_ticks', cmd: 'berserk', everyTicks: 6 },
    ]);
  });

  it('every_ticks clamps a negative / non-numeric interval to 0', () => {
    expect(parseActionsFromEditor('every_ticks -2 fury')).toEqual([
      { kind: 'send_every_ticks', cmd: 'fury', everyTicks: 0 },
    ]);
    expect(parseActionsFromEditor('every_ticks x berserk')).toEqual([
      { kind: 'send_every_ticks', cmd: 'berserk', everyTicks: 0 },
    ]);
  });

  it('round-trips send_every_ticks through serialize → parse', () => {
    const actions: AutoLevelAction[] = [{ kind: 'send_every_ticks', cmd: 'berserk', everyTicks: 6 }];
    expect(serializeActionsToEditor(actions)).toBe('every_ticks 6 berserk');
    expect(parseActionsFromEditor(serializeActionsToEditor(actions))).toEqual(actions);
  });
});
