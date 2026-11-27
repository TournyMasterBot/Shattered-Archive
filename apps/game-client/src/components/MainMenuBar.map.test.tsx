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

// The map is a production feature: no build flag decides whether the menu item exists, only whether the page gave a handler.
describe('MainMenuBar: the Map item', () => {
  it('is absent when no handler is passed', () => {
    render(<MainMenuBar {...props} />);
    expect(screen.queryByText('Map…')).toBeNull();
  });

  it('opens the map when it is chosen', () => {
    const onOpenMap = jest.fn();
    render(<MainMenuBar {...props} onOpenMap={onOpenMap} />);
    fireEvent.click(screen.getByText('Map…'));
    expect(onOpenMap).toHaveBeenCalledTimes(1);
  });

  it('sits in the Game menu after Equipment and before Autopilot', () => {
    render(<MainMenuBar {...props} onOpenMap={jest.fn()} />);
    const text = document.body.textContent ?? '';
    expect(text.indexOf('Equipment…')).toBeLessThan(text.indexOf('Map…'));
    expect(text.indexOf('Map…')).toBeLessThan(text.indexOf('Autopilot…'));
  });
});
