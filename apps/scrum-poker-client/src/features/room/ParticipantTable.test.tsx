import { render, screen, within } from '@testing-library/react';

import type { ParticipantView } from '@shatteredarchive/scrum-poker-core';

import ParticipantTable from './ParticipantTable.js';

function participant(overrides: Partial<ParticipantView> & { id: string; name: string }): ParticipantView {
  return { hasVoted: false, vote: null, lastActiveAt: 0, ...overrides };
}

describe('ParticipantTable', () => {
  it('distinguishes not-voted, voted-but-hidden, and revealed', () => {
    render(
      <ParticipantTable
        youId="p0"
        revealed={false}
        participants={[
          participant({ id: 'p0', name: 'Ada', hasVoted: true, vote: '5' }),
          participant({ id: 'p1', name: 'Grace', hasVoted: true, vote: null }),
          participant({ id: 'p2', name: 'Alan' }),
        ]}
      />,
    );

    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(within(rows[0]!).getByText('5')).toBeDefined();
    expect(within(rows[1]!).getByLabelText('Estimate submitted, hidden until revealed')).toBeDefined();
    expect(within(rows[2]!).getByLabelText('No estimate yet')).toBeDefined();
  });

  it('marks which row is you', () => {
    render(
      <ParticipantTable
        youId="p1"
        revealed
        participants={[participant({ id: 'p0', name: 'Ada' }), participant({ id: 'p1', name: 'Grace' })]}
      />,
    );

    const graceRow = screen.getByText('Grace').closest('tr')!;
    expect(within(graceRow).getByText('you')).toBeDefined();
    expect(within(screen.getByText('Ada').closest('tr')!).queryByText('you')).toBeNull();
  });

  it('explains the empty room rather than showing a bare table', () => {
    render(<ParticipantTable youId={null} revealed={false} participants={[]} />);
    expect(screen.getByText(/Share the invite link/i)).toBeDefined();
  });
});
