// apps/game-client/src/components/AccountModal.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AccountModal from './AccountModal';

const mockHook = {
  isLoggedIn: false,
  busy: false,
  loginPending: false,
  status: null as null | { kind: 'ok' | 'err' | 'info'; text: string },
  handleLogin: jest.fn(),
  handleLogout: jest.fn(),
  handleSaveToCloud: jest.fn(),
  handleLoadFromCloud: jest.fn(),
};

jest.mock('../hooks/useAccountModal', () => ({
  useAccountModal: () => mockHook,
}));

function setup(over: Partial<typeof mockHook> = {}, props: { isOpen?: boolean } = {}) {
  Object.assign(mockHook, {
    isLoggedIn: false,
    busy: false,
    loginPending: false,
    status: null,
    ...over,
  });
  const onClose = jest.fn();
  render(<AccountModal isOpen={props.isOpen ?? true} onClose={onClose} connectionId="dsl-mud" />);
  return { onClose };
}

beforeEach(() => jest.clearAllMocks());

describe('AccountModal', () => {
  it('renders nothing while closed', () => {
    setup({}, { isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers only the login when signed out', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Log in with Shattered Archive account' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Load from cloud/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Connection:/)).not.toBeInTheDocument();
  });

  it('starts the login when the button is pressed', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Log in with Shattered Archive account' }));
    expect(mockHook.handleLogin).toHaveBeenCalledTimes(1);
  });

  it('shows the waiting state, disables the button and explains what to do while the login is pending', () => {
    setup({ loginPending: true });
    expect(screen.getByRole('button', { name: 'Waiting for the sign-in window…' })).toBeDisabled();
    expect(screen.getByText(/Finish signing in in the window that just opened/)).toBeInTheDocument();
  });

  it('does not start a sign-in while a cloud action is busy', () => {
    setup({ busy: true });
    const button = screen.getByRole('button', { name: 'Log in with Shattered Archive account' });

    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(mockHook.handleLogin).not.toHaveBeenCalled();
  });

  it('shows the connection and the three cloud actions when signed in, wired to their handlers', () => {
    setup({ isLoggedIn: true });
    expect(screen.getByText('Connection: dsl-mud')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in with Shattered Archive account' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save this connection/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Load from cloud into this connection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(mockHook.handleSaveToCloud).toHaveBeenCalledTimes(1);
    expect(mockHook.handleLoadFromCloud).toHaveBeenCalledTimes(1);
    expect(mockHook.handleLogout).toHaveBeenCalledTimes(1);
  });

  it('explains that Load asks first and that an empty cloud never wipes the device', () => {
    setup({ isLoggedIn: true });
    expect(screen.getByText(/Load\s+shows what it will replace and asks first/)).toBeInTheDocument();
    expect(screen.getByText(/an empty cloud never wipes this device/)).toBeInTheDocument();
  });

  it('disables every cloud action while one is running', () => {
    setup({ isLoggedIn: true, busy: true });
    expect(screen.getByRole('button', { name: /Save this connection/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Load from cloud into this connection' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeDisabled();
  });

  it.each([
    ['ok', 'Loaded 3 scripts'],
    ['err', 'Load failed (scripts): boom'],
    ['info', 'Checking what is saved in the cloud…'],
  ] as const)('shows a %s status message', (kind, text) => {
    setup({ isLoggedIn: true, status: { kind, text } });
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('shows no status area when there is no status', () => {
    setup({ isLoggedIn: true });
    expect(screen.queryByText(/Loaded|failed|Checking/)).not.toBeInTheDocument();
  });

  it('closes from both the header and the footer', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
