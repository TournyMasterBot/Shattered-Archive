import { fireEvent, render, screen } from '@testing-library/react';
import { MainMenuBar } from './MainMenuBar';

jest.mock('./GraphicsSettingsModal', () => ({ __esModule: true, default: () => null }));
jest.mock('./AudioSettingsModal', () => ({ __esModule: true, default: () => null }));
jest.mock('./AccessibilitySettingsModal', () => ({ __esModule: true, default: () => null }));

const noop = () => undefined;
const props = {
  onOpenCustomStyles: noop,
  onOpenScriptSandbox: noop,
  onOpenConnect: noop,
  onOpenAccount: noop,
  onOpenPlugins: noop,
  onOpenLibrary: noop,
  onOpenEquipment: noop,
  onOpenAutoLeveling: noop,
  onOpenIdentifyObject: noop,
  onOpenCreatureLore: noop,
  onOpenScriptingHelp: noop,
};

type Flags = { __COPILOT_LOCAL__?: boolean; __SIMULACRUM_ADMIN_LOCAL__?: boolean };
const flags = (copilot: boolean, admin: boolean): void => {
  (globalThis as Flags).__COPILOT_LOCAL__ = copilot;
  (globalThis as Flags).__SIMULACRUM_ADMIN_LOCAL__ = admin;
};
afterEach(() => flags(false, false));

describe('MainMenuBar: the Simulacrum Admin item (local-only)', () => {
  it('is absent when its build flag is false, even if a handler is passed', () => {
    flags(false, false);
    render(<MainMenuBar {...props} onOpenSimulacrumAdmin={jest.fn()} />);
    expect(screen.queryByText('Simulacrum Admin…')).toBeNull();
  });

  it('is absent when the flag is true but no handler is passed (not connected to the simulacrum)', () => {
    flags(false, true);
    render(<MainMenuBar {...props} />);
    expect(screen.queryByText('Simulacrum Admin…')).toBeNull();
  });

  it('is present when the flag is true and a handler is passed, and opens the window', () => {
    flags(false, true);
    const onOpenSimulacrumAdmin = jest.fn();
    render(<MainMenuBar {...props} onOpenSimulacrumAdmin={onOpenSimulacrumAdmin} />);
    fireEvent.click(screen.getByText('Simulacrum Admin…'));
    expect(onOpenSimulacrumAdmin).toHaveBeenCalledTimes(1);
  });

  it('is not shown because the Copilot flag is true (the two switches are independent)', () => {
    flags(true, false);
    render(<MainMenuBar {...props} onOpenCopilot={jest.fn()} onOpenSimulacrumAdmin={jest.fn()} />);
    expect(screen.getByText('Copilot…')).toBeTruthy();
    expect(screen.queryByText('Simulacrum Admin…')).toBeNull();
  });

  it('shows both items with both flags on, and each opens only its own window; Autopilot is unchanged', () => {
    flags(true, true);
    const onOpenCopilot = jest.fn();
    const onOpenSimulacrumAdmin = jest.fn();
    const onOpenAutoLeveling = jest.fn();
    render(
      <MainMenuBar
        {...props}
        onOpenAutoLeveling={onOpenAutoLeveling}
        onOpenCopilot={onOpenCopilot}
        onOpenSimulacrumAdmin={onOpenSimulacrumAdmin}
      />,
    );
    fireEvent.click(screen.getByText('Simulacrum Admin…'));
    expect(onOpenSimulacrumAdmin).toHaveBeenCalledTimes(1);
    expect(onOpenCopilot).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Copilot…'));
    expect(onOpenCopilot).toHaveBeenCalledTimes(1);
    expect(onOpenSimulacrumAdmin).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Autopilot…'));
    expect(onOpenAutoLeveling).toHaveBeenCalledTimes(1);
  });
});
