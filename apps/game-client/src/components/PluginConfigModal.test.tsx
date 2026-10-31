import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PluginConfigModal } from './PluginConfigModal';
import { pluginHost } from '../features/plugins/pluginHost';
import { corePluginDefaults } from '../features/plugins/pluginConfigOverrides';

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

// What Save hands to the parent: only the settings that differ from the plugin's defaults (SETTINGS-01), so a setting the
// user left alone keeps following the plugin's future defaults. roller's first two fields are totalTarget (default 245)
// and minStr (default 0); number inputs carry no accessible label, so they are addressed by position.
describe('PluginConfigModal — what Save stores', () => {
  const renderRoller = (initialUserConfig: Record<string, unknown> = {}) => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(
      <PluginConfigModal
        isOpen
        onClose={onClose}
        connectionId="test-conn"
        pluginId="roller"
        initialUserConfig={initialUserConfig}
        onSave={onSave}
        isEnabled
      />,
    );
    const inputs = () => screen.getAllByRole('spinbutton') as HTMLInputElement[];
    return { onSave, onClose, inputs };
  };
  const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

  it('hands over nothing when Save is pressed without changing anything', () => {
    const { onSave, onClose } = renderRoller();

    press('Save');

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('roller', {});
    expect(onClose).toHaveBeenCalled();
  });

  it('hands over only the edited setting', () => {
    const { onSave, inputs } = renderRoller();

    fireEvent.change(inputs()[1], { target: { value: '12' } });
    press('Save');

    expect(onSave).toHaveBeenCalledWith('roller', { minStr: 12 });
  });

  it('hands over nothing for a setting edited back to its default', () => {
    const { onSave, inputs } = renderRoller();

    fireEvent.change(inputs()[1], { target: { value: '12' } });
    fireEvent.change(inputs()[1], { target: { value: '0' } });
    press('Save');

    expect(onSave).toHaveBeenCalledWith('roller', {});
  });

  it('treats a boolean the same way: on is stored, switched back off is not', () => {
    const { onSave } = renderRoller();
    const debug = screen.getByRole('checkbox', { name: 'Debug logging' });

    fireEvent.click(debug);
    press('Save');
    fireEvent.click(debug);
    press('Save');

    expect(onSave).toHaveBeenNthCalledWith(1, 'roller', { debug: true });
    expect(onSave).toHaveBeenNthCalledWith(2, 'roller', {});
  });

  it('keeps the other overrides when one of them is edited back to its default', () => {
    const { onSave, inputs } = renderRoller({ minStr: 5, minInt: 6 });

    fireEvent.change(inputs()[1], { target: { value: '0' } });
    press('Save');

    expect(onSave).toHaveBeenCalledWith('roller', { minInt: 6 });
  });

  it('drops the defaults from a config that arrives in the old shape (a full copy of the defaults)', () => {
    const { onSave } = renderRoller({ ...corePluginDefaults('roller'), minStr: 9 });

    press('Save');

    expect(onSave).toHaveBeenCalledWith('roller', { minStr: 9 });
  });

  it('Reset to defaults puts the defaults in the editor but stores nothing until Save (E5)', () => {
    const { onSave, inputs } = renderRoller({ minStr: 5 });
    expect(inputs()[1].value).toBe('5');

    press('Reset to defaults');

    expect(inputs()[1].value).toBe('0');
    expect(onSave).not.toHaveBeenCalled();

    press('Save');
    expect(onSave).toHaveBeenCalledWith('roller', {});
  });

  it('Cancel after Reset discards the reset (E5)', () => {
    const { onSave, onClose } = renderRoller({ minStr: 5 });

    press('Reset to defaults');
    press('Cancel');

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Reset when nothing is stored changes nothing: Save still hands over nothing (E5)', () => {
    const { onSave, inputs } = renderRoller();

    press('Reset to defaults');
    press('Save');

    expect(inputs()[0].value).toBe('245');
    expect(onSave).toHaveBeenCalledWith('roller', {});
  });
});
