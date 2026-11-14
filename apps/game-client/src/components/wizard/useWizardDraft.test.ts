import { act, renderHook } from '@testing-library/react';

import { emptyDraft, targetRowId, useWizardDraft, type DraftTarget } from './useWizardDraft';

// Target rows are identified by a stable id (the room line changes when the player edits it), and the draft keeps the player's
// edits-that-no-longer-match list next to the rows.

const area = (lookName: string, over: Partial<DraftTarget> = {}): DraftTarget => ({
  lookName,
  engageName: 'kw',
  enabled: true,
  origin: 'area',
  key: lookName.toLowerCase(),
  defaultLookName: lookName,
  defaultEngageName: 'kw',
  ...over,
});

describe('targetRowId', () => {
  it('uses the original-line key for an area row, so an edit of the room line does not change the identity', () => {
    const row = area('A Scout.');
    expect(targetRowId(row)).toBe('a:a scout.');
    expect(targetRowId({ ...row, lookName: 'Edited line.' })).toBe('a:a scout.');
  });

  it('derives the key from the room line when an area row carries none', () => {
    expect(targetRowId({ origin: 'area', lookName: '  A  Scout. ' })).toBe('a:a scout.');
  });

  it('uses the stored record id for a custom row, and the normalized line for a draft-only one', () => {
    expect(targetRowId({ origin: 'custom', id: 'target:9', lookName: 'x' })).toBe('c:target:9');
    expect(targetRowId({ origin: 'custom', lookName: ' A  Mob. ' })).toBe('c:draft:a mob.');
  });
});

describe('useWizardDraft targets', () => {
  const setup = () => renderHook(() => useWizardDraft());

  it('starts with no rows and no unmatched edits', () => {
    expect(emptyDraft().unmatchedOverrides).toEqual([]);
    expect(setup().result.current.draft.unmatchedOverrides).toEqual([]);
  });

  it('setArea sets the rows and the unmatched list, and defaults the list to empty', () => {
    const { result } = setup();
    act(() => result.current.setArea('a', null, [area('One.')], [{ id: 'o1', key: 'gone' }]));
    expect(result.current.draft.targets).toHaveLength(1);
    expect(result.current.draft.unmatchedOverrides).toEqual([{ id: 'o1', key: 'gone' }]);

    act(() => result.current.setArea('b', null, [area('Two.')]));
    expect(result.current.draft.areaSlug).toBe('b');
    expect(result.current.draft.unmatchedOverrides).toEqual([]);
  });

  it('toggleTarget switches only the row with that identity', () => {
    const { result } = setup();
    act(() => result.current.setArea('a', null, [area('One.'), area('Two.')]));
    act(() => result.current.toggleTarget('a:one.', false));
    expect(result.current.draft.targets.map((t) => t.enabled)).toEqual([false, true]);
  });

  it('editTarget changes the named fields of one row and keeps its identity', () => {
    const { result } = setup();
    act(() => result.current.setArea('a', null, [area('One.'), area('Two.')]));
    act(() => result.current.editTarget('a:two.', { lookName: 'Renamed.', engageName: 'new', overridden: true }));

    const [one, two] = result.current.draft.targets;
    expect(one.lookName).toBe('One.');
    expect(two).toMatchObject({ lookName: 'Renamed.', engageName: 'new', overridden: true, key: 'two.' });
    act(() => result.current.toggleTarget('a:two.', false)); // still found by the same identity
    expect(result.current.draft.targets[1].enabled).toBe(false);
  });

  it('addCustomTarget adds a row with its record id, and ignores a room line already shown, in any case or spacing', () => {
    const { result } = setup();
    act(() => result.current.setArea('a', null, [area('A Scout.')]));
    act(() => result.current.addCustomTarget({ lookName: 'A tall orc.', engageName: 'orc', id: 'target:1' }));
    act(() => result.current.addCustomTarget({ lookName: '  a   tall ORC. ', engageName: 'dup' }));
    act(() => result.current.addCustomTarget({ lookName: 'a scout.', engageName: 'dup2' }));

    expect(result.current.draft.targets.map((t) => t.lookName)).toEqual(['A Scout.', 'A tall orc.']);
    expect(result.current.draft.targets[1]).toMatchObject({ origin: 'custom', id: 'target:1', enabled: true });
  });

  it('addCustomTarget also refuses the original line of a row the player edited or hid', () => {
    const { result } = setup();
    act(() => result.current.setArea('a', null, [area('A Scout.', { lookName: 'Renamed.', hidden: true })]));
    act(() => result.current.addCustomTarget({ lookName: 'A scout.', engageName: 'x' }));
    expect(result.current.draft.targets).toHaveLength(1);
  });

  it('removeCustomTarget removes only a custom row with that identity, never an area row', () => {
    const { result } = setup();
    act(() => result.current.setArea('a', null, [area('One.')]));
    act(() => result.current.addCustomTarget({ lookName: 'Mine.', engageName: 'm', id: 'target:1' }));
    act(() => result.current.removeCustomTarget('a:one.'));
    expect(result.current.draft.targets).toHaveLength(2);
    act(() => result.current.removeCustomTarget('c:target:1'));
    expect(result.current.draft.targets.map((t) => t.lookName)).toEqual(['One.']);
  });

  it('deleteUnmatched drops one unmatched edit by record id', () => {
    const { result } = setup();
    act(() =>
      result.current.setArea('a', null, [], [
        { id: 'o1', key: 'a' },
        { id: 'o2', key: 'b' },
      ]),
    );
    act(() => result.current.deleteUnmatched('o1'));
    expect(result.current.draft.unmatchedOverrides).toEqual([{ id: 'o2', key: 'b' }]);
  });
});
