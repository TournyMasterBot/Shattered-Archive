import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import SocialsPage from './SocialsPage.js';

// Mirrors the emitter's #SOCIALS shape: full 8-field smile, early-terminated grin.
const SOCIAL_AREA_TEXT = `#AREA
social.are~
Socials~
{ 1 50} Test  Socials~
0 0

#SOCIALS

smile 0 0
You smile happily.
$n smiles happily.
You smile at $M.
$n beams a smile at $N.
$n smiles at you.
$
You smile at yourself.
$n smiles at $mself.

grin 0 0
You grin evilly.
$n grins evilly.
#

#0

#$
`;

describe('SocialsPage (Phase 6)', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/capabilities')) return json({ writeEnabled: false, mercAreaPath: '/tmp' });
      if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'social.are', name: 'Socials' }] });
      if (url.endsWith('/api/areas/social.are')) {
        const { parseAreaFile } = await import('@shatteredarchive/merc-area');
        return json({ file: 'social.are', area: parseAreaFile(SOCIAL_AREA_TEXT) });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
  });

  it('lists socials, edits a message, blanks one to $, and preserves early termination', async () => {
    render(<SocialsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Socials$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'smile' }));

    const first = (await screen.findByLabelText('You see (no target)')) as HTMLInputElement;
    expect(first.value).toBe('You smile happily.');
    // The `$` field renders blank.
    expect((screen.getByLabelText('You see (target not found)') as HTMLInputElement).value).toBe('');

    fireEvent.change(first, { target: { value: 'You beam brightly.' } });
    // Blank a set field → back to unset ($).
    fireEvent.change(screen.getByLabelText('Others see (no target)'), { target: { value: '' } });

    // The early-terminated social exposes only its 2 lines + an add button.
    fireEvent.click(screen.getByRole('button', { name: 'grin' }));
    expect(screen.getByRole('button', { name: /2 of 8 present/ })).toBeTruthy();

    // The emitted file reflects all of it, grin's '#' terminator included.
    fireEvent.click(screen.getByRole('button', { name: /Manual edit/ }));
    const textarea = (await screen.findByLabelText('Raw area file text')) as HTMLTextAreaElement;
    expect(textarea.value).toContain('You beam brightly.');
    expect(textarea.value).toContain('You beam brightly.\n$\n'); // blanked field emits $
    expect(textarea.value).toContain('You grin evilly.\n$n grins evilly.\n#\n');
  });

  it('adds and deletes a social', async () => {
    render(<SocialsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Socials$/ }));
    fireEvent.click(await screen.findByRole('button', { name: '+ Add social' }));

    expect(((await screen.findByLabelText('Social name')) as HTMLInputElement).value).toBe('newsocial');
    fireEvent.click(screen.getByRole('button', { name: /Manual edit/ }));
    const textarea = (await screen.findByLabelText('Raw area file text')) as HTMLTextAreaElement;
    expect(textarea.value).toContain('You newsocial.');
    fireEvent.click(screen.getByRole('button', { name: /Manual edit/ })); // back to the form

    window.confirm = jest.fn(() => true);
    fireEvent.click(await screen.findByRole('button', { name: "Delete social 'newsocial'" }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'newsocial' })).toBeNull());
  });
});
