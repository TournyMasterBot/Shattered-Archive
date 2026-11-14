import { createLearning, validateControl } from './learning';

describe('the learning switch', () => {
  it('starts off, and calls back only when the state really changes', () => {
    const seen: boolean[] = [];
    const learning = createLearning((on) => seen.push(on));
    expect(learning.enabled()).toBe(false);
    expect(learning.set(false)).toBe(false);
    expect(learning.set(true)).toBe(true);
    expect(learning.set(true)).toBe(false);
    expect(learning.enabled()).toBe(true);
    expect(learning.set(false)).toBe(true);
    expect(seen).toEqual([true, false]);
  });
});

describe('validateControl', () => {
  it.each([true, false])('accepts { enabled: %s }', (enabled) => {
    expect(validateControl({ enabled })).toEqual({ ok: true, enabled });
  });

  it.each([
    [null, 'body must be an object'],
    ['yes', 'body must be an object'],
    [[true], 'body must be an object'],
    [{}, 'enabled must be true or false'],
    [{ enabled: 'true' }, 'enabled must be true or false'],
    [{ enabled: 1 }, 'enabled must be true or false'],
  ])('refuses %j', (body, reason) => {
    expect(validateControl(body)).toEqual({ ok: false, errors: [reason] });
  });

  it('names an unknown field (cut short) and still checks enabled', () => {
    const result = validateControl({ enabled: true, ['x'.repeat(60)]: 1 });
    expect(result).toEqual({ ok: false, errors: ['unknown field: ' + 'x'.repeat(40)] });
    expect(validateControl({ other: 1 })).toEqual({ ok: false, errors: ['unknown field: other', 'enabled must be true or false'] });
  });
});
