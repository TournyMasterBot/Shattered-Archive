import '@testing-library/jest-dom';
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

const flag = (value: boolean) => ((globalThis as { __COPILOT_LOCAL__?: boolean }).__COPILOT_LOCAL__ = value);
afterEach(() => flag(false));

describe('MainMenuBar: the Copilot item (local-only)', () => {
  it('is absent when the build flag is false, even if a handler is passed', () => {
    flag(false);
    render(<MainMenuBar {...props} onOpenCopilot={jest.fn()} />);
    expect(screen.queryByText('Copilot…')).toBeNull();
  });

  it('is absent when the flag is true but no handler is passed', () => {
    flag(true);
    render(<MainMenuBar {...props} />);
    expect(screen.queryByText('Copilot…')).toBeNull();
  });

  it('is present when the flag is true and a handler is passed, and opens Copilot', () => {
    flag(true);
    const onOpenCopilot = jest.fn();
    render(<MainMenuBar {...props} onOpenCopilot={onOpenCopilot} />);
    fireEvent.click(screen.getByText('Copilot…'));
    expect(onOpenCopilot).toHaveBeenCalledTimes(1);
  });

  it('says (off) next to the item while Copilot is switched off, and nothing when it is on or unknown', () => {
    flag(true);
    const view = render(<MainMenuBar {...props} onOpenCopilot={jest.fn()} copilotOff />);
    expect(screen.getByText('(off)', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Copilot…')).toBeInTheDocument(); // the item still reads Copilot…
    view.rerender(<MainMenuBar {...props} onOpenCopilot={jest.fn()} copilotOff={false} />);
    expect(screen.queryByText('(off)', { exact: false })).toBeNull();
    view.rerender(<MainMenuBar {...props} onOpenCopilot={jest.fn()} />);
    expect(screen.queryByText('(off)', { exact: false })).toBeNull();
  });

  it('still opens Copilot when the click lands on the (off) hint', () => {
    flag(true);
    const onOpenCopilot = jest.fn();
    render(<MainMenuBar {...props} onOpenCopilot={onOpenCopilot} copilotOff />);
    fireEvent.click(screen.getByText('(off)', { exact: false }));
    expect(onOpenCopilot).toHaveBeenCalledTimes(1);
  });

  it('leaves the Autopilot item as it was', () => {
    flag(true);
    const onOpenAutoLeveling = jest.fn();
    render(<MainMenuBar {...props} onOpenAutoLeveling={onOpenAutoLeveling} onOpenCopilot={jest.fn()} />);
    fireEvent.click(screen.getByText('Autopilot…'));
    expect(onOpenAutoLeveling).toHaveBeenCalledTimes(1);
  });
});
