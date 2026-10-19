// apps/game-client/src/components/hud/CompactLayoutShellNarrow.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CompactLayoutShellNarrow } from './CompactLayoutShellNarrow';

jest.mock('../../hooks/useCharacterIdentity', () => ({
  useCharacterIdentity: () => ({ characterName: 'Aria' }),
}));
jest.mock('./CompactVitalsRow', () => ({ CompactVitalsRow: () => <div>vitals-row</div> }));
jest.mock('./CompactRoomRow', () => ({ CompactRoomRow: () => <div>room-row</div> }));
jest.mock('./CompactWidgetSlot', () => ({
  CompactWidgetSlot: ({ slotId }: { slotId: string }) => <div>widget-slot:{slotId}</div>,
}));
jest.mock('../ChatPane', () => ({ ChatPane: () => <div>chat-pane</div> }));
jest.mock('../AffectsBlock', () => ({ __esModule: true, default: () => <div>affects-block</div> }));
jest.mock('../CommandInput', () => ({
  __esModule: true,
  default: () => <div>command-input</div>,
}));

describe('CompactLayoutShellNarrow', () => {
  const baseProps = { isConnected: true, sendRaw: jest.fn(), terminalSlotRef: jest.fn() };

  it('renders a terminal slot, vitals row, room row, bottomStrip slot, and command input unconditionally', () => {
    render(<CompactLayoutShellNarrow {...baseProps} />);

    expect(screen.getByText('vitals-row')).toBeInTheDocument();
    expect(screen.getByText('room-row')).toBeInTheDocument();
    expect(screen.getByText('widget-slot:hud.bottomStrip')).toBeInTheDocument();
    expect(screen.getByText('command-input')).toBeInTheDocument();
  });

  it('shows the character name as the terminal panel title', () => {
    render(<CompactLayoutShellNarrow {...baseProps} />);
    expect(screen.getByText('Aria')).toBeInTheDocument();
  });

  it('defaults to the Chat tab, hiding Affects and the rightColumn slot', () => {
    render(<CompactLayoutShellNarrow {...baseProps} />);

    expect(screen.getByText('chat-pane')).toBeInTheDocument();
    expect(screen.queryByText('affects-block')).not.toBeInTheDocument();
    expect(screen.queryByText('widget-slot:hud.rightColumn')).not.toBeInTheDocument();
  });

  it('switches to the Affects tab, hiding Chat', () => {
    render(<CompactLayoutShellNarrow {...baseProps} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Affects' }));

    expect(screen.getByText('affects-block')).toBeInTheDocument();
    expect(screen.getByText('widget-slot:hud.rightColumn')).toBeInTheDocument();
    expect(screen.queryByText('chat-pane')).not.toBeInTheDocument();
  });

  it('shows the Slate & Amber footer label', () => {
    render(<CompactLayoutShellNarrow {...baseProps} />);
    expect(screen.getByText('Slate & Amber')).toBeInTheDocument();
  });
});
