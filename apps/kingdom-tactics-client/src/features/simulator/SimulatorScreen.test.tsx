import { render, screen, fireEvent, within } from '@testing-library/react';

import { NavProvider } from '../../state/nav';
import { SimulatorScreen, clampMatches, MAX_MATCHES } from './SimulatorScreen';

const renderScreen = () =>
  render(
    <NavProvider>
      <SimulatorScreen />
    </NavProvider>,
  );

describe('SimulatorScreen', () => {
  it('runs a tiny batch and renders reconciling metrics', async () => {
    renderScreen();

    fireEvent.change(screen.getByLabelText('Matches'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    // Results appear once the async batch resolves.
    const results = await screen.findByRole('region', { name: 'Batch results' });
    expect(within(results).getByText(/Results — 3 matches/)).toBeTruthy();

    // A win-rate bar per side (skirmish = 2 sides), each labelled with its rate.
    const bars = within(results).getAllByRole('img', { name: /win rate/i });
    expect(bars).toHaveLength(2);

    // Totals reconcile: sum of per-side win counts + draws === 3.
    const winCounts = bars.map((b) => {
      const m = b.getAttribute('aria-label')!.match(/(\d+) of 3/);
      return m ? Number(m[1]) : 0;
    });
    const drawsDd = within(results).getByText('Draws').closest('div')!;
    const draws = Number(within(drawsDd).getByText(/^\d+$/).textContent);
    expect(winCounts.reduce((a, b) => a + b, 0) + draws).toBe(3);

    // Avg turns is a positive number.
    const avgDd = within(results).getByText('Avg turns').closest('div')!;
    expect(Number(within(avgDd).getByText(/^\d/).textContent)).toBeGreaterThan(0);
  });

  it('clamps the match count to the v1 range [1, 500]', () => {
    expect(clampMatches(9999)).toBe(MAX_MATCHES);
    expect(clampMatches(0)).toBe(1);
    expect(clampMatches(-4)).toBe(1);
    expect(clampMatches(3.9)).toBe(3);
    expect(clampMatches(Number.NaN)).toBe(1);
  });
});
