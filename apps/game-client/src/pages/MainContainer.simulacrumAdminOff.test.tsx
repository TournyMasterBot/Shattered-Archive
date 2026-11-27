// Production build (flag false): MainContainer never loads the Simulacrum Admin window and shows no menu entry for it.
import '../testing/mainContainerHarness';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MainContainer } from './MainContainer';

const windowModuleLoaded = jest.fn();
jest.mock('../components/SimulacrumAdminWindow', () => {
  windowModuleLoaded();
  return { __esModule: true, default: () => <div role="dialog" aria-label="simulacrum-admin-stub" /> };
});

describe('MainContainer — Simulacrum Admin with its flag false (production)', () => {
  it('renders no host, no dialog and no menu entry, and never loads the window module', async () => {
    render(<MainContainer />);
    await screen.findByText('classic-shell');
    expect(screen.queryByText('Simulacrum Admin…')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'simulacrum-admin-stub' })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20)); // a lazy import would have been requested by now
    expect(windowModuleLoaded).not.toHaveBeenCalled();
  });
});
