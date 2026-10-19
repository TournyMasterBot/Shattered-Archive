import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CompactWidgetSlot } from './CompactWidgetSlot';
import { publishHudWidget, __resetForTests } from '../../features/hudLayout/hudWidgetRegistry';

describe('CompactWidgetSlot', () => {
  afterEach(() => {
    publishHudWidget('hud.rightColumn', 'test', null);
    __resetForTests();
  });

  it('renders nothing when the slot is empty', () => {
    const { container } = render(<CompactWidgetSlot slotId="hud.rightColumn" />);
    expect(container.querySelector('[data-hud-slot]')).toBeNull();
  });

  it('shows the current occupant read at mount (late-mount snapshot)', () => {
    publishHudWidget('hud.rightColumn', 'autoleveling', { label: 'Enemy', value: 'A rabid wolf' });

    render(<CompactWidgetSlot slotId="hud.rightColumn" />);

    expect(screen.getByText('Enemy')).toBeInTheDocument();
    expect(screen.getByText('A rabid wolf')).toBeInTheDocument();
  });

  it('updates live when the occupant changes after mount', () => {
    render(<CompactWidgetSlot slotId="hud.rightColumn" />);
    expect(screen.queryByText('A rabid wolf')).toBeNull();

    act(() => {
      publishHudWidget('hud.rightColumn', 'autoleveling', { value: 'A rabid wolf' });
    });

    expect(screen.getByText('A rabid wolf')).toBeInTheDocument();
  });

  it('exposes the variant as a data attribute for theme CSS to target', () => {
    publishHudWidget('hud.rightColumn', 'autoleveling', { value: 'Low HP!', variant: 'warning' });
    render(<CompactWidgetSlot slotId="hud.rightColumn" />);

    expect(screen.getByText('Low HP!').closest('[data-hud-slot]')).toHaveAttribute('data-variant', 'warning');
  });
});
