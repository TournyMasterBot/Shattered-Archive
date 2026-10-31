// Regression: a saved JavaScript global came back blank (with "Unsaved changes")
// after closing and reopening the sandbox, because the close handler resets the
// draft to '' and nothing re-synced it on reopen.
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserScriptSandboxModal from './UserScriptSandboxModal';
import { setGlobalScriptSource } from '../features/userScripts/globalScriptsStore';

jest.mock('../features/auth/siteApi', () => ({
  SITE_ORIGIN: 'http://localhost:5000',
  siteApiBase: () => '/api/site',
}));

const editor = () => document.querySelector('textarea') as HTMLTextAreaElement;

function openGlobalsTab() {
  fireEvent.click(screen.getByRole('button', { name: 'Globals' }));
}

beforeEach(() => window.localStorage.clear());

describe('UserScriptSandboxModal — Globals tab across close and reopen', () => {
  it('shows the saved JavaScript global again after the modal is closed and reopened', () => {
    setGlobalScriptSource('dsl-mud', 'javascript', 'const farm = 1;');
    const { rerender } = render(<UserScriptSandboxModal isOpen onClose={() => {}} connectionId="dsl-mud" />);

    openGlobalsTab();
    expect(editor().value).toBe('const farm = 1;');

    rerender(<UserScriptSandboxModal isOpen={false} onClose={() => {}} connectionId="dsl-mud" />);
    rerender(<UserScriptSandboxModal isOpen onClose={() => {}} connectionId="dsl-mud" />);
    openGlobalsTab();

    expect(editor().value).toBe('const farm = 1;');
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('shows a global saved under the legacy default id when the connected id is dsl-mud', () => {
    setGlobalScriptSource('default', 'javascript', 'saved while disconnected');

    render(<UserScriptSandboxModal isOpen onClose={() => {}} connectionId="dsl-mud" />);
    openGlobalsTab();

    expect(editor().value).toBe('saved while disconnected');
  });

  it('keeps showing a non-JavaScript global after reopening and selecting that language', () => {
    setGlobalScriptSource('dsl-mud', 'lua', 'x = 1');
    const { rerender } = render(<UserScriptSandboxModal isOpen onClose={() => {}} connectionId="dsl-mud" />);
    openGlobalsTab();
    fireEvent.change(document.querySelector('select') as HTMLSelectElement, {
      target: { value: 'lua' },
    });
    expect(editor().value).toBe('x = 1');

    rerender(<UserScriptSandboxModal isOpen={false} onClose={() => {}} connectionId="dsl-mud" />);
    rerender(<UserScriptSandboxModal isOpen onClose={() => {}} connectionId="dsl-mud" />);
    openGlobalsTab();
    fireEvent.change(document.querySelector('select') as HTMLSelectElement, {
      target: { value: 'lua' },
    });

    expect(editor().value).toBe('x = 1');
  });
});
