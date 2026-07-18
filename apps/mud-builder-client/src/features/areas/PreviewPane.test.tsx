import { render, screen, fireEvent } from '@testing-library/react';

import PreviewPane from './PreviewPane.js';
import type { PreviewResult } from '../../api/client.js';

/** Phase 11: resolved cross-area refs render as navigable links; real warnings stay a plain list. */

const PREVIEW: PreviewResult = {
  file: 'tiny.are',
  text: '#AREA\n#$\n',
  diff: { identical: true, start: 0, removed: [], added: [] },
  refs: {
    errors: [],
    warnings: ['room 110 exit 0: leads to room 9999 — room 9999 is not defined in this file or any listed area'],
    external: [
      { kind: 'room', vnum: 3001, where: 'room 110 exit 2', file: 'midgaard.are', name: 'The Temple Square' },
    ],
  },
};

describe('PreviewPane external refs (Phase 11)', () => {
  it('lists resolved refs as links and clicking navigates', () => {
    const onNavigate = jest.fn();
    render(<PreviewPane preview={PREVIEW} onNavigate={onNavigate} />);

    expect(screen.getByText('1 cross-area reference(s) — resolved, all targets exist')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /room #3001 — The Temple Square \(midgaard\.are\)/ }));
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'room', vnum: 3001, file: 'midgaard.are' }),
    );

    // The unresolved vnum stays a warning.
    expect(screen.getByText(/1 INVALID reference/)).toBeTruthy();
  });

  it('renders resolved refs as plain text without onNavigate', () => {
    render(<PreviewPane preview={PREVIEW} />);
    expect(screen.queryByRole('button', { name: /room #3001/ })).toBeNull();
    expect(screen.getByText(/room #3001 — The Temple Square \(midgaard\.are\)/)).toBeTruthy();
  });
});
