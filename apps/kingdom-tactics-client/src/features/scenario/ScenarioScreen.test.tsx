import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { NavProvider } from '../../state/nav';
import { ScenarioScreen } from './ScenarioScreen';

const renderScenario = () =>
  render(
    <NavProvider>
      <ScenarioScreen />
    </NavProvider>,
  );

afterEach(cleanup);

describe('ScenarioScreen', () => {
  it('starts on side 0 with no steps and is not over', () => {
    renderScenario();
    expect(screen.getByText('Turn 1')).toBeTruthy();
    expect(screen.getByText('Controlling: Side 0')).toBeTruthy();
    expect(screen.getByText('Steps: 0')).toBeTruthy();
    expect(screen.queryByText(/Scenario complete/)).toBeNull();
  });

  it('stepping a move advances state + history; ending a turn hands control to the other side', () => {
    renderScenario();
    // Default Skirmish (10×10): side-0 units deploy on the bottom row (y = 9).
    fireEvent.click(screen.getByLabelText(/\(3,9\)/));
    const moveCells = document.querySelectorAll('.kt-cell--move');
    expect(moveCells.length).toBeGreaterThan(0);
    fireEvent.click(moveCells[0] as HTMLElement);
    expect(screen.getByText('Steps: 1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'End turn' }));
    expect(screen.getByText('Controlling: Side 1')).toBeTruthy();
    expect(screen.getByText('Steps: 2')).toBeTruthy();
  });
});
