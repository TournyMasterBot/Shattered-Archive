// The sandbox modal in the shared window stack: Escape closes it from anywhere on the page, the import/export dialog drawn inside it is closed
// first, and its overlay is drawn above a window that was open before it.
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { useWindowLayer } from '../hooks/useWindowLayer';
import UserScriptSandboxModal from './UserScriptSandboxModal';

jest.mock('../features/auth/siteApi', () => ({
  SITE_ORIGIN: 'http://localhost:5000',
  siteApiBase: () => '/api/site',
}));

beforeEach(() => window.localStorage.clear());

describe('UserScriptSandboxModal: Escape and stacking', () => {
  it('Escape closes the modal with the focus anywhere on the page, once per press', () => {
    const onClose = jest.fn();
    render(<UserScriptSandboxModal isOpen onClose={onClose} connectionId="dsl-mud" />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the import/export dialog first, and the modal on the next press', () => {
    const onClose = jest.fn();
    render(<UserScriptSandboxModal isOpen onClose={onClose} connectionId="dsl-mud" />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByText('Export User Scripts')).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByText('Export User Scripts')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled(); // only the dialog answered

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the import dialog is closed by Escape the same way', () => {
    const onClose = jest.fn();
    render(<UserScriptSandboxModal isOpen onClose={onClose} connectionId="dsl-mud" />);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByText('Import User Scripts')).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByText('Import User Scripts')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does nothing for Escape while closed, and leaves the stack when it is closed', () => {
    const onClose = jest.fn();
    const view = render(<UserScriptSandboxModal isOpen={false} onClose={onClose} connectionId="dsl-mud" />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    view.rerender(<UserScriptSandboxModal isOpen onClose={onClose} connectionId="dsl-mud" />);
    view.rerender(<UserScriptSandboxModal isOpen={false} onClose={onClose} connectionId="dsl-mud" />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('its overlay is drawn above a window that was open before it', () => {
    const Earlier: React.FC = () => {
      const layer = useWindowLayer({ open: true, onEscape: () => undefined });
      return <div data-testid="earlier" style={{ zIndex: layer.zIndex }} />;
    };
    render(<Earlier />);
    const view = render(<UserScriptSandboxModal isOpen onClose={() => undefined} connectionId="dsl-mud" />);
    const overlay = view.container.firstElementChild as HTMLElement;
    expect(Number(overlay.style.zIndex)).toBeGreaterThan(Number(screen.getByTestId('earlier').style.zIndex));
  });
});
