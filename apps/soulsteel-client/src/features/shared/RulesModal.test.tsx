import { fireEvent, render, screen } from '@testing-library/react';

import RulesModal from './RulesModal.js';

describe('RulesModal', () => {
  it('renders the title and every major section', () => {
    render(<RulesModal onClose={jest.fn()} />);
    expect(screen.getByText('The Umbral Cloak and the Soulsteel Dagger')).toBeDefined();
    for (const heading of ['The Game', 'The Rules', 'The Roles', 'Win Conditions', 'Recommendations']) {
      expect(screen.getByText(heading)).toBeDefined();
    }
  });

  it('matches the source text verbatim, typos and all', () => {
    render(<RulesModal onClose={jest.fn()} />);
    const content = screen.getByRole('dialog').textContent ?? '';
    // "excercise" and "aide" are typos in the source document — preserved intentionally, not
    // "corrected", per the source being authoritative and not to be reworded.
    expect(content).toContain('A social deduction excercise where');
    expect(content).toContain('try to aide them');
    expect(content).toContain('Coordinates assassination handling.');
    expect(content).toContain('The player is shielded from ALL special effects.');
  });

  it('lists every role with its name as a heading', () => {
    render(<RulesModal onClose={jest.fn()} />);
    for (const role of ['Herald', 'Umbraseer', 'Darkshield', 'Dark Knights', 'Cultist Assassin']) {
      expect(screen.getByRole('heading', { name: role })).toBeDefined();
    }
  });

  it('states both win conditions', () => {
    render(<RulesModal onClose={jest.fn()} />);
    // Term spans split the sentence across nodes, so check the list's combined text rather
    // than a single getByText match (which only matches within one node's own text run).
    const list = screen.getByText('Dark Knight victory').closest('dl');
    expect(list?.textContent).toContain('Eliminate all Assassins');
    expect(list?.textContent).toContain(
      'The number of Dark Knights must be less than or equal to the number of Assassins.',
    );
  });

  it('closes on backdrop click but not on dialog click', () => {
    const onClose = jest.fn();
    render(<RulesModal onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes via the close button', () => {
    const onClose = jest.fn();
    render(<RulesModal onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close rules'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
