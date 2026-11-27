import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CombatHelp from './CombatHelp';

describe('CombatHelp', () => {
  it('explains that a timeout pauses the run and that Resume or Stop follows', () => {
    render(<CombatHelp onBack={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'When autopilot pauses itself' }).tagName).toBe('H4');
    const article = screen.getByLabelText('Combat help');
    expect(article.textContent).toContain('does not stop');
    expect(article.textContent).toContain('Press Resume to continue');
    expect(article.textContent).toContain('Stop to end the run');
  });

  it('keeps the other sections the Combat step relies on', () => {
    render(<CombatHelp onBack={() => undefined} />);
    for (const name of ['If a cast fails', 'What gets sent to the game', 'What you keep', 'Pausing a fight command']) {
      expect(screen.getByRole('heading', { name }).tagName).toBe('H4');
    }
  });

  it('goes back to the combat step', () => {
    const onBack = jest.fn();
    render(<CombatHelp onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /Back to combat/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
