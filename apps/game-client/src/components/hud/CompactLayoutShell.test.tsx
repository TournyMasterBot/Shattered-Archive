// apps/game-client/src/components/hud/CompactLayoutShell.test.tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CompactLayoutShell } from './CompactLayoutShell';

jest.mock('../../hooks/useCharacterIdentity', () => ({
  useCharacterIdentity: () => ({ characterName: 'Aria' }),
}));
jest.mock('./CompactVitalsRow', () => ({ CompactVitalsRow: () => <div>vitals-row</div> }));
jest.mock('./CompactRoomRow', () => ({ CompactRoomRow: () => <div>room-row</div> }));
jest.mock('./CompactWidgetSlot', () => ({
  CompactWidgetSlot: ({ slotId }: { slotId: string }) => <div>widget-slot:{slotId}</div>,
}));
jest.mock('../Terminal', () => ({ __esModule: true, default: () => <div>terminal</div> }));
jest.mock('../ChatPane', () => ({ ChatPane: () => <div>chat-pane</div> }));
jest.mock('../AffectsBlock', () => ({ __esModule: true, default: () => <div>affects-block</div> }));
jest.mock('../CommandInput', () => ({
  __esModule: true,
  default: () => <div>command-input</div>,
}));

describe('CompactLayoutShell', () => {
  const baseProps = { isConnected: true, sendRaw: jest.fn() };

  it('renders the terminal, vitals row, room row, both widget slots, chat, and affects', () => {
    render(<CompactLayoutShell {...baseProps} />);

    expect(screen.getByText('terminal')).toBeInTheDocument();
    expect(screen.getByText('vitals-row')).toBeInTheDocument();
    expect(screen.getByText('room-row')).toBeInTheDocument();
    expect(screen.getByText('widget-slot:hud.bottomStrip')).toBeInTheDocument();
    expect(screen.getByText('widget-slot:hud.rightColumn')).toBeInTheDocument();
    expect(screen.getByText('command-input')).toBeInTheDocument();
    expect(screen.getByText('chat-pane')).toBeInTheDocument();
    expect(screen.getByText('affects-block')).toBeInTheDocument();
  });

  it('shows the character name as the terminal panel title', () => {
    render(<CompactLayoutShell {...baseProps} />);
    expect(screen.getByText('Aria')).toBeInTheDocument();
  });
});
