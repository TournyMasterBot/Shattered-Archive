import { characterId, validateDescription, validateIndexRecord, validateNameEntry, type StoredDescription } from './records';

const nameEntry = { id: 'zorvak', codename: 'Antlia', kind: 'real', gender: 'U', firstSeen: 1, lastSeen: 2 };
const indexRecord = { id: 'real:Antlia', codename: 'Antlia', kind: 'real', gender: 'U', nameHash: 'a'.repeat(16), firstSeen: 1, lastSeen: 2 };
const description: StoredDescription = {
  id: 'test:Agate-F',
  codename: 'Agate',
  kind: 'test',
  at: 5,
  fields: { Eyes: 'green' },
  hasDescription: true,
  rawAnsi: 'a',
  dsl: 'a',
  text: 'a',
  unmapped: [],
};

describe('characterId', () => {
  it('is one id per real character whatever its gender, and one per test codename and gender', () => {
    expect(characterId('real', 'Orion', 'U')).toBe('real:Orion');
    expect(characterId('real', 'Orion', 'M')).toBe('real:Orion');
    expect(characterId('test', 'Agate', 'F')).toBe('test:Agate-F');
    expect(characterId('test', 'Agate', 'M')).not.toBe(characterId('test', 'Agate', 'F'));
  });
});

describe('validateNameEntry', () => {
  it('accepts a good entry', () => expect(validateNameEntry(nameEntry)).toEqual({ ok: true, value: nameEntry }));

  it.each([
    ['not an object', 'text'],
    ['an array', []],
    ['an id that is not a normalised name', { ...nameEntry, id: 'Zorvak' }],
    ['an id with a space', { ...nameEntry, id: 'zor vak' }],
    ['a bad codename', { ...nameEntry, codename: '9x' }],
    ['kind test', { ...nameEntry, kind: 'test' }],
    ['a bad gender', { ...nameEntry, gender: 'X' }],
    ['a negative time', { ...nameEntry, firstSeen: -1 }],
    ['a fractional time', { ...nameEntry, lastSeen: 1.5 }],
    ['an unknown field', { ...nameEntry, extra: 1 }],
  ])('rejects %s', (_label, value) => expect(validateNameEntry(value).ok).toBe(false));
});

describe('validateIndexRecord', () => {
  it('accepts a real and a test record', () => {
    expect(validateIndexRecord(indexRecord).ok).toBe(true);
    expect(validateIndexRecord({ ...indexRecord, id: 'test:Agate-F', codename: 'Agate', kind: 'test', gender: 'F' }).ok).toBe(true);
  });

  it.each([
    ['not an object', null],
    ['an id that does not match the kind and codename', { ...indexRecord, id: 'real:Other' }],
    ['a test record with gender U', { ...indexRecord, id: 'test:Antlia-U', kind: 'test', gender: 'U' }],
    ['a test id without the gender', { ...indexRecord, id: 'test:Agate', codename: 'Agate', kind: 'test', gender: 'F' }],
    ['an unknown kind', { ...indexRecord, kind: 'robot' }],
    ['a non-string codename', { ...indexRecord, codename: 5 }],
    ['a bad hash', { ...indexRecord, nameHash: 'xyz' }],
    ['a name field', { ...indexRecord, name: 'Zorvak' }],
    ['a bad time', { ...indexRecord, lastSeen: 'now' }],
  ])('rejects %s', (_label, value) => expect(validateIndexRecord(value).ok).toBe(false));
});

describe('validateDescription', () => {
  it('accepts a good description and returns copies', () => {
    const checked = validateDescription(description);
    expect(checked).toEqual({ ok: true, value: description });
    if (checked.ok) expect(checked.value.fields).not.toBe(description.fields);
  });

  it.each([
    ['not an object', 3],
    ['a bad kind', { ...description, kind: 'x' }],
    ['a non-string id', { ...description, id: 5 }],
    ['an id outside the pattern', { ...description, id: 'fake:Agate-F' }],
    ['an id that is another character', { ...description, id: 'test:Other-F' }],
    ['a bad time', { ...description, at: -5 }],
    ['hasDescription not boolean', { ...description, hasDescription: 'yes' }],
    ['text too long', { ...description, text: 'x'.repeat(100_001) }],
    ['text not a string', { ...description, dsl: 5 }],
    ['fields not an object', { ...description, fields: [] }],
    ['too many fields', { ...description, fields: Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, 'v'])) }],
    ['a field value too long', { ...description, fields: { Eyes: 'x'.repeat(401) } }],
    ['a field label too long', { ...description, fields: { ['k'.repeat(41)]: 'v' } }],
    ['unmapped not an array', { ...description, unmapped: 'x' }],
    ['too many unmapped', { ...description, unmapped: Array.from({ length: 101 }, () => 'x') }],
    ['an unmapped entry too long', { ...description, unmapped: ['x'.repeat(41)] }],
    ['an unknown field', { ...description, name: 'Zorvak' }],
    ['a bad codename', { ...description, codename: '!' }],
  ])('rejects %s', (_label, value) => expect(validateDescription(value).ok).toBe(false));

  it('lists each problem once', () => {
    const checked = validateDescription({ ...description, fields: [], unmapped: 5 });
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.errors).toEqual(['fields', 'unmapped']);
  });
});
