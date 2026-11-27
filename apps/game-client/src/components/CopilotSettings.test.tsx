import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { BucketTable } from '@shatteredarchive/copilot-core';
import type { ApiResult, CopilotApi } from '../features/copilot/api';
import { SETTINGS_KEY, createSettingsStore, type KeyValueStorage } from '../features/copilot/settings';
import CopilotSettings from './CopilotSettings';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

interface Options {
  table?: BucketTable;
  reachable?: boolean;
  stored?: unknown;
}

function setup(o: Options = {}) {
  const storage = memoryStorage();
  if (o.stored !== undefined) storage.data.set(SETTINGS_KEY, JSON.stringify(o.stored));
  const settings = createSettingsStore(storage, () => undefined);
  const api = {
    getBucketStats: async (): Promise<ApiResult<BucketTable>> => (o.reachable === false ? { ok: false, reason: 'offline' } : { ok: true, value: o.table ?? {} }),
  } as unknown as CopilotApi;
  const view = render(<CopilotSettings api={api} settings={settings} intervalMs={20} />);
  const stored = (): unknown => (storage.data.has(SETTINGS_KEY) ? JSON.parse(storage.data.get(SETTINGS_KEY) as string) : null);
  return { storage, settings, stored, ...view };
}

const box = (sphere: string, kind: string) => screen.getByLabelText(`Auto-approve ${sphere} ${kind}`) as HTMLInputElement;
const slider = (sphere: string, kind: string) => screen.getByLabelText(`Threshold for ${sphere} ${kind}`) as HTMLInputElement;
const staleInput = () => screen.getByLabelText('Treat the game as quiet after (seconds)') as HTMLInputElement;
const open = (name: string) => (screen.getByText(name).closest('details') as HTMLDetailsElement).open;
const pause = (ms: number) => act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));

describe('CopilotSettings: the rules', () => {
  it('starts with every rule off and a control only for the kinds a rule can enable (4 spheres x 7 kinds)', async () => {
    setup();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(28);
    expect(boxes.every((b) => !(b as HTMLInputElement).checked)).toBe(true);
    expect(screen.getAllByRole('slider').every((s) => (s as HTMLInputElement).disabled)).toBe(true);
    await pause(5);
  });

  it('S1: switching a rule on stores only what differs from the defaults, and switching it off removes the key', async () => {
    const t = setup();
    expect(t.stored()).toBeNull();
    fireEvent.click(box('world', 'move'));
    expect(box('world', 'move').checked).toBe(true);
    expect(t.stored()).toEqual({ schemaVersion: 1, rules: { 'world:move': { enabled: true, threshold: 0.9 } } });
    fireEvent.click(box('world', 'move'));
    expect(t.stored()).toBeNull(); // back to the default: nothing is kept
    expect(t.storage.data.has(SETTINGS_KEY)).toBe(false);
    await pause(5);
  });

  it('the threshold can be moved only while the rule is on, within 0.50 to 0.99, and is stored rounded', async () => {
    const t = setup();
    const range = slider('world', 'move');
    expect(range).toBeDisabled();
    expect([range.min, range.max, range.step]).toEqual(['0.5', '0.99', '0.01']);
    fireEvent.click(box('world', 'move'));
    expect(range).toBeEnabled();
    fireEvent.change(range, { target: { value: '0.8' } });
    expect(screen.getAllByText('0.80')).toHaveLength(1);
    expect(t.stored()).toEqual({ schemaVersion: 1, rules: { 'world:move': { enabled: true, threshold: 0.8 } } });
    fireEvent.change(range, { target: { value: '0.9300000000000001' } });
    expect((t.stored() as { rules: Record<string, { threshold: number }> }).rules['world:move'].threshold).toBe(0.93);
    await pause(5);
  });

  it('S2: the same rules switched on in a different order are stored identically', async () => {
    const first = setup();
    fireEvent.click(box('fighting', 'fight-continue'));
    fireEvent.click(box('world', 'move'));
    const a = first.storage.data.get(SETTINGS_KEY);
    first.unmount();
    const second = setup();
    fireEvent.click(box('world', 'move'));
    fireEvent.click(box('fighting', 'fight-continue'));
    expect(second.storage.data.get(SETTINGS_KEY)).toBe(a);
    await pause(5);
  });

  it('S3: Reset asks first; Keep leaves everything, Reset puts the defaults back at once, in the open window', async () => {
    const t = setup();
    fireEvent.click(box('world', 'move'));
    fireEvent.change(staleInput(), { target: { value: '120' } });
    expect(t.settings.get().staleAfterSeconds).toBe(120);

    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Reset settings' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep my settings' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(box('world', 'move').checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset' }));
    expect(box('world', 'move').checked).toBe(false);
    expect(staleInput().value).toBe('60');
    expect(t.settings.get().rules).toEqual({});
    expect(t.storage.data.has(SETTINGS_KEY)).toBe(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await pause(5);
  });

  it('S4: the editor, the reset button and another tab all end in the same normalised settings', async () => {
    const t = setup();
    // route 1: the editor
    fireEvent.click(box('world', 'move'));
    const viaEditor = t.settings.get();

    // route 3: another tab writes the same thing (plus rubbish that must be dropped)
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' })); // route 2: reset
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset' }));
    expect(box('world', 'move').checked).toBe(false);
    act(() => {
      t.settings.onStorageEvent({
        key: SETTINGS_KEY,
        newValue: JSON.stringify({ rules: { 'world:move': { enabled: true, threshold: 0.9 }, 'world:bogus': { enabled: true }, 'sky:move': { enabled: true } } }),
      });
    });
    expect(box('world', 'move').checked).toBe(true);
    expect(t.settings.get()).toEqual(viaEditor);
    await pause(5);
  });

  it('a stored blob that tries to switch on the floor or an unknown kind shows no such control and keeps nothing of it', async () => {
    const t = setup({
      stored: { schemaVersion: 1, rules: { 'world:speak': { enabled: true, threshold: 0.5 }, 'interaction:spend-or-lose': { enabled: true }, 'things:unknown': { enabled: true }, 'world:move': { enabled: true, threshold: 0.7 } } },
    });
    expect(t.settings.get().rules).toEqual({ 'world:move': { enabled: true, threshold: 0.7 } });
    expect(screen.queryByLabelText('Auto-approve world speak')).toBeNull();
    expect(screen.queryByLabelText('Auto-approve interaction spend-or-lose')).toBeNull();
    expect(box('world', 'move').checked).toBe(true);
    expect(slider('world', 'move').value).toBe('0.7');
    await pause(5);
  });

  it('a kind that cannot be vouched for yet says so on its row', async () => {
    setup();
    expect(screen.getAllByText('Copilot cannot read a target yet, so this still asks.')).toHaveLength(4);
    await pause(5);
  });
});

describe('CopilotSettings: the floor', () => {
  it('lists every kind that always asks, with the reason, and offers no control inside it', async () => {
    setup();
    const floor = screen.getByRole('region', { name: 'Always asks you' });
    for (const kind of ['spend-or-lose', 'speak', 'irreversible', 'pk', 'unknown', 'fight-start-unknown']) {
      expect(within(floor).getByText(kind)).toBeInTheDocument();
    }
    expect(within(floor).getByText(/Speaks to other players/)).toBeInTheDocument();
    expect(within(floor).getByText(/Attacks another player/)).toBeInTheDocument();
    expect(within(floor).getAllByText(/It asks, and files a ticket/)).toHaveLength(2);
    expect(floor.querySelectorAll('input, button, select, textarea')).toHaveLength(0);
    await pause(5);
  });
});

describe('CopilotSettings: stale after', () => {
  it('stores a valid whole number at once and keeps it after the field loses focus', async () => {
    const t = setup();
    expect(staleInput().value).toBe('60');
    fireEvent.change(staleInput(), { target: { value: '300' } });
    expect(t.stored()).toEqual({ schemaVersion: 1, staleAfterSeconds: 300 });
    fireEvent.blur(staleInput());
    expect(staleInput().value).toBe('300');
    await pause(5);
  });

  it.each(['3', '4', '3601', '5000', '12.5', '', 'abc'])('rejects %p with a message, stores nothing, and shows the stored value again on blur', async (typed) => {
    const t = setup();
    fireEvent.change(staleInput(), { target: { value: typed } });
    expect(screen.getByRole('alert')).toHaveTextContent('Use a whole number from 5 to 3600.');
    expect(staleInput()).toHaveAttribute('aria-invalid', 'true');
    expect(t.stored()).toBeNull();
    fireEvent.blur(staleInput());
    expect(staleInput().value).toBe('60');
    await pause(5);
  });

  it('accepts the limits 5 and 3600', async () => {
    const t = setup();
    fireEvent.change(staleInput(), { target: { value: '5' } });
    expect(t.settings.get().staleAfterSeconds).toBe(5);
    fireEvent.change(staleInput(), { target: { value: '3600' } });
    expect(t.settings.get().staleAfterSeconds).toBe(3600);
    await pause(5);
  });
});

describe('CopilotSettings: earned confidence', () => {
  it('shows what the owner’s answers have earned, how far a bucket is from 20 answers, and when there are none', async () => {
    setup({ table: { 'world:move': { approved: 18, total: 20 }, 'world:info': { approved: 5, total: 5 } } });
    await screen.findByText('Earned 0.70 (18 of 20 approved)');
    expect(screen.getByText('5 of 20 answers')).toBeInTheDocument();
    expect(screen.getAllByText('No answers yet').length).toBe(26);
  });

  it('keeps the last counts and says so when the server cannot be reached', async () => {
    setup({ reachable: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('Server unreachable: showing the last counts.');
    expect(screen.getAllByText('No answers yet').length).toBe(28);
  });
});

describe('CopilotSettings: which spheres are open', () => {
  it('opens the world, and any sphere that already has a rule on; the rest start folded', async () => {
    setup({ stored: { schemaVersion: 1, rules: { 'fighting:fight-continue': { enabled: true, threshold: 0.9 } } } });
    expect(open('World')).toBe(true);
    expect(open('Fighting')).toBe(true);
    expect(open('Interaction')).toBe(false);
    expect(open('Things')).toBe(false);
    await pause(5);
  });

  it('follows the owner folding and unfolding a sphere', async () => {
    setup();
    const things = screen.getByText('Things').closest('details') as HTMLDetailsElement;
    act(() => {
      things.open = true;
      fireEvent(things, new Event('toggle'));
    });
    await waitFor(() => expect(things.open).toBe(true));
    act(() => {
      things.open = false;
      fireEvent(things, new Event('toggle'));
    });
    await waitFor(() => expect(things.open).toBe(false));
    // a toggle that changes nothing (the same state again) leaves it alone
    act(() => void fireEvent(things, new Event('toggle')));
    expect(things.open).toBe(false);
    await pause(5);
  });
});
