// Flagged build (the dev stack): MainContainer wires the Simulacrum Admin menu item to a lazily rendered window, shown only while the
// lazy host says the client is on the simulacrum.
import '../testing/simulacrumAdminFlagOn'; // first: sets the build flag before MainContainer is loaded
import '../testing/mainContainerHarness';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MainContainer } from './MainContainer';

// The real host listens to the connection; here only MainContainer's wiring of it is under test, so the stub lets a test say "entered" or
// "left the simulacrum" and shows a dialog while it is open.
jest.mock('../components/SimulacrumAdminWindow', () => ({
  __esModule: true,
  default: ({
    isOpen,
    onClose,
    onAvailableChange,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onAvailableChange: (available: boolean) => void;
  }) => (
    <>
      <button onClick={() => onAvailableChange(true)}>enter-simulacrum-stub</button>
      <button onClick={() => onAvailableChange(false)}>leave-simulacrum-stub</button>
      {isOpen ? (
        <div role="dialog" aria-label="simulacrum-admin-stub">
          <button onClick={onClose}>close-simulacrum-admin-stub</button>
        </div>
      ) : null}
    </>
  ),
}));

describe('MainContainer — local-only Simulacrum Admin window (flag true)', () => {
  beforeEach(() => window.localStorage.clear());
  afterAll(() => {
    (globalThis as { __SIMULACRUM_ADMIN_LOCAL__?: boolean }).__SIMULACRUM_ADMIN_LOCAL__ = false;
  });

  it('has no menu entry before the client is on the simulacrum', async () => {
    render(<MainContainer />);
    await screen.findByText('enter-simulacrum-stub');
    expect(screen.queryByText('Simulacrum Admin…')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'simulacrum-admin-stub' })).toBeNull();
  });

  it('shows the entry once on the simulacrum, keeps the window closed until it is used, and opens, closes and reopens it', async () => {
    render(<MainContainer />);
    fireEvent.click(await screen.findByText('enter-simulacrum-stub'));
    expect(screen.getByText('Simulacrum Admin…')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'simulacrum-admin-stub' })).toBeNull();

    fireEvent.click(screen.getByText('Simulacrum Admin…'));
    expect(await screen.findByRole('dialog', { name: 'simulacrum-admin-stub' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('close-simulacrum-admin-stub'));
    expect(screen.queryByRole('dialog', { name: 'simulacrum-admin-stub' })).toBeNull();

    fireEvent.click(screen.getByText('Simulacrum Admin…'));
    expect(await screen.findByRole('dialog', { name: 'simulacrum-admin-stub' })).toBeInTheDocument();
  });

  it('removes the entry and closes an open window when the client leaves the simulacrum (E2)', async () => {
    render(<MainContainer />);
    fireEvent.click(await screen.findByText('enter-simulacrum-stub'));
    fireEvent.click(screen.getByText('Simulacrum Admin…'));
    expect(await screen.findByRole('dialog', { name: 'simulacrum-admin-stub' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('leave-simulacrum-stub'));
    expect(screen.queryByRole('dialog', { name: 'simulacrum-admin-stub' })).toBeNull();
    expect(screen.queryByText('Simulacrum Admin…')).toBeNull();

    // entering again shows the entry but does not reopen the window by itself
    fireEvent.click(screen.getByText('enter-simulacrum-stub'));
    expect(screen.getByText('Simulacrum Admin…')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'simulacrum-admin-stub' })).toBeNull();
  });

  it('does not show the Copilot item or window because this flag is on (the Copilot flag is off here)', async () => {
    render(<MainContainer />);
    fireEvent.click(await screen.findByText('enter-simulacrum-stub'));
    expect(screen.queryByText('Copilot…')).toBeNull();
  });
});
