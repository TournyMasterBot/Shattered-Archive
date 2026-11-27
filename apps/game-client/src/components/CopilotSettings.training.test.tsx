import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ApiResult, CopilotApi, TrainingStatus } from '../features/copilot/api';
import { createSettingsStore, type KeyValueStorage } from '../features/copilot/settings';
import type { TrainingState } from '../features/copilot/useTraining';
import CopilotSettings from './CopilotSettings';

const storage = (): KeyValueStorage => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

function setup(status: TrainingStatus | undefined, withHook = true) {
  const sets: boolean[] = [];
  const training: TrainingState = { status, set: async (on) => void sets.push(on) };
  const api = { getBucketStats: async (): Promise<ApiResult<never>> => ({ ok: true, value: {} as never }) } as unknown as CopilotApi;
  render(<CopilotSettings api={api} settings={createSettingsStore(storage(), () => undefined)} intervalMs={20} training={withHook ? training : undefined} />);
  return { sets };
}
const pause = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 5))));
const toggle = () => screen.getByLabelText('Claude training') as HTMLInputElement;

describe('CopilotSettings: Claude training', () => {
  it('offers the switch only while the server says the connection is the Simulacrum\'s', async () => {
    setup({ enabled: false, world: 'sandbox', canEnable: true });
    expect(toggle()).not.toBeChecked();
    expect(toggle()).toBeEnabled();
    expect(screen.getByText(/kept apart from yours and never reach the game you play for real/)).toBeInTheDocument();
    await pause();
  });

  it.each<[string, TrainingStatus | undefined, boolean]>([
    ['the production game', { enabled: false, world: 'dsl', canEnable: false, refusal: 'not-simulacrum' }, true],
    ['no connection', { enabled: false, canEnable: false, refusal: 'not-simulacrum' }, true],
    ['an unknown server state', undefined, true],
    ['no training hook at all', { enabled: false, world: 'sandbox', canEnable: true }, false],
  ])('shows nothing for %s', async (_label, status, withHook) => {
    setup(status, withHook);
    expect(screen.queryByLabelText('Claude training')).toBeNull();
    expect(screen.queryByText(/Let Claude train Copilot here/)).toBeNull();
    await pause();
  });

  it('asks the server to turn it on and off with the checkbox', async () => {
    const t = setup({ enabled: false, world: 'sandbox', canEnable: true });
    fireEvent.click(toggle());
    expect(t.sets).toEqual([true]);
    await pause();
  });

  it('shows it on, and lets it be turned off', async () => {
    const t = setup({ enabled: true, world: 'sandbox', canEnable: true });
    expect(toggle()).toBeChecked();
    fireEvent.click(toggle());
    expect(t.sets).toEqual([false]);
    await pause();
  });

  it('cannot be turned on when the server would refuse (Copilot is off)', async () => {
    setup({ enabled: false, world: 'sandbox', canEnable: false, refusal: 'copilot-off' });
    expect(toggle()).toBeDisabled();
    await pause();
  });

  it('can still be turned off when it is on although the server would not turn it on again now', async () => {
    const t = setup({ enabled: true, world: 'sandbox', canEnable: false, refusal: 'not-simulacrum' });
    expect(toggle()).toBeEnabled();
    fireEvent.click(toggle());
    expect(t.sets).toEqual([false]);
    await pause();
  });
});
