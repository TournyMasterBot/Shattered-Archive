import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PluginConfigModal } from './PluginConfigModal';
import { pluginHost } from '../features/plugins/pluginHost';

// HOST-2: invokePluginAction now returns 'ok' | 'no-handler' | 'error' so the Configure panel's action
// buttons stop flashing "✓ Synced" when nothing ran. The label branches and the 1.5 s reset had no test.
// level-progress is a real core plugin that declares two config actions ('refetch', 'check-score').
describe('PluginConfigModal — plugin action button feedback', () => {
  const ACTION_LABEL = 'Re-fetch now (worth)';

  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const renderModal = () =>
    render(
      <PluginConfigModal
        isOpen
        onClose={jest.fn()}
        connectionId="test-conn"
        pluginId="level-progress"
        initialUserConfig={{}}
        onSave={jest.fn()}
        isEnabled
      />,
    );

  it.each([
    ['ok', '✓ Synced'],
    ['no-handler', 'No handler'],
    ['error', 'Failed'],
  ] as const)('a "%s" result shows "%s" and then returns to the action label', (result, label) => {
    jest.spyOn(pluginHost, 'invokePluginAction').mockReturnValue(result);
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: ACTION_LABEL }));

    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ACTION_LABEL })).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('button', { name: ACTION_LABEL })).toBeInTheDocument();
  });

  it('with no running plugin host (nothing registered) the click reports "No handler", never "✓ Synced"', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: ACTION_LABEL }));
    expect(screen.getByRole('button', { name: 'No handler' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '✓ Synced' })).not.toBeInTheDocument();
  });

  it('pushes the unsaved draft to the running plugin and invokes the clicked action key', () => {
    const update = jest.spyOn(pluginHost, 'updateEnabledPluginConfig').mockImplementation(() => {});
    const invoke = jest.spyOn(pluginHost, 'invokePluginAction').mockReturnValue('ok');
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: ACTION_LABEL }));

    expect(update).toHaveBeenCalledWith('level-progress', expect.any(Object));
    expect(invoke).toHaveBeenCalledWith('level-progress', 'refetch');
  });
});
