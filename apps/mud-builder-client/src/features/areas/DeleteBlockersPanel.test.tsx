import { render, screen, fireEvent, within } from '@testing-library/react';

import DeleteBlockersPanel, { categorizeBlocker } from './DeleteBlockersPanel.js';

describe('categorizeBlocker', () => {
  it('sorts each known blocker shape into its category', () => {
    expect(categorizeBlocker('reset #3 (M): mob 3700 into room 3701')).toBe('resets');
    expect(categorizeBlocker('room 100 exit 0: leads to room 101')).toBe('map');
    expect(categorizeBlocker('shop: keeper mob 3700')).toBe('mobs');
    expect(categorizeBlocker('special: spec_cast_adept on mob 3700')).toBe('mobs');
    expect(categorizeBlocker('room script (greet) attached to room 101')).toBe('scripts');
    expect(categorizeBlocker('script on mob 3700: warp to room 101')).toBe('scripts');
    expect(categorizeBlocker('something unexpected')).toBe('other');
  });
});

describe('DeleteBlockersPanel', () => {
  it('renders nothing when there are no blockers', () => {
    const { container } = render(<DeleteBlockersPanel entityLabel="room #101" blockers={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('groups blockers by category and only shows a "Go fix it" button when a callback is wired', () => {
    const onGoToResets = jest.fn();
    const onGoToMap = jest.fn();
    render(
      <DeleteBlockersPanel
        entityLabel="room #101"
        blockers={['reset #3 (M): mob 3700 into room 101', 'room 100 exit 0: leads to room 101', 'shop: keeper mob 3700']}
        onGoToResets={onGoToResets}
        onGoToMap={onGoToMap}
        // no onGoToMobs — that group should render its items with no button
      />,
    );

    expect(screen.getByText(/Cannot delete room #101/)).toBeTruthy();

    const resetsGroup = screen.getByText('Resets').closest('div')!;
    expect(within(resetsGroup).getByText(/reset #3/)).toBeTruthy();
    fireEvent.click(within(resetsGroup).getByRole('button', { name: 'Go fix it in Resets →' }));
    expect(onGoToResets).toHaveBeenCalledTimes(1);

    const mapGroup = screen.getByText('Map (room exits)').closest('div')!;
    fireEvent.click(within(mapGroup).getByRole('button', { name: 'Go fix it on the Map →' }));
    expect(onGoToMap).toHaveBeenCalledTimes(1);

    const mobsGroup = screen.getByText('Mobs (shops / specials)').closest('div')!;
    expect(within(mobsGroup).getByText(/shop: keeper/)).toBeTruthy();
    expect(within(mobsGroup).queryByRole('button')).toBeNull();
  });
});
