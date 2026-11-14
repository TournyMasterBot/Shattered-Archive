import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import OutcomeView from './OutcomeView';
import type { RunOutcome } from '../../features/simulacrumAdmin/sender';

const sent = (verdict: 'accepted' | 'refused' | 'unknown', replyLines: string[], reason?: string): RunOutcome => ({
  status: 'sent',
  entry: { id: 1, at: 'x', line: 'stat Testchar', verdict, replyLines, rawReply: '', ...(reason ? { reason } : {}) },
});

describe('OutcomeView', () => {
  it('shows an accepted reply as done, in the accepted tone, with the game’s lines', () => {
    render(<OutcomeView outcome={sent('accepted', ['Name: Testchar', 'Level: 5'], 'Name: Testchar')} />);
    const box = screen.getByRole('status');
    expect(box).toHaveAttribute('data-tone', 'accepted');
    expect(box).toHaveTextContent('Done: the game answered as expected');
    expect(box.querySelector('pre')?.textContent).toBe('Name: Testchar\nLevel: 5');
  });

  it('shows a refusal in the refused tone and never as done', () => {
    render(<OutcomeView outcome={sent('refused', ['They aren’t here.'], 'They aren’t here.')} />);
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'refused');
    expect(screen.getByRole('status')).not.toHaveTextContent('Done');
  });

  it('says the game sent no text for an answer without lines', () => {
    render(<OutcomeView outcome={sent('unknown', [])} />);
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'unknown');
    expect(screen.getByText('The game sent no text.')).toBeInTheDocument();
    expect(screen.queryByText((_, el) => el?.tagName === 'PRE')).not.toBeInTheDocument();
  });

  it('shows a not-sent outcome as information without the "no text" note', () => {
    render(<OutcomeView outcome={{ status: 'declined' }} />);
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'info');
    expect(screen.getByRole('status')).toHaveTextContent('Cancelled: nothing was sent.');
    expect(screen.queryByText('The game sent no text.')).not.toBeInTheDocument();
  });
});
