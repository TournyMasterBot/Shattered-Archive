import { fireEvent, render, screen } from '@testing-library/react';

import UserScriptDialog from './UserScriptDialog.js';

const variants = [
  { language: 'javascript', label: 'JavaScript', source: 'doAfter(0, "world", "look");' },
  { language: 'lua', label: 'Lua', source: 'doAfter(0, "world", "look")' },
];

describe('UserScriptDialog', () => {
  it('shows the first variant by default', () => {
    render(<UserScriptDialog title="t" dialogLabel="t" hint="h" variants={variants} onClose={jest.fn()} />);
    const textarea = screen.getByLabelText('JavaScript source') as HTMLTextAreaElement;
    expect(textarea.value).toBe('doAfter(0, "world", "look");');
    expect(screen.getByRole('tab', { name: 'JavaScript' }).getAttribute('aria-selected')).toBe('true');
  });

  it('switches the shown source when another language tab is clicked', () => {
    render(<UserScriptDialog title="t" dialogLabel="t" hint="h" variants={variants} onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Lua' }));

    expect(screen.getByLabelText('Lua source')).toBeDefined();
    expect(screen.queryByLabelText('JavaScript source')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Lua' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'JavaScript' }).getAttribute('aria-selected')).toBe('false');
  });

  it('copies the currently active variant, not always the first one', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<UserScriptDialog title="t" dialogLabel="t" hint="h" variants={variants} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Lua' }));
    fireEvent.click(screen.getByText('Copy commands'));

    await screen.findByText('Copied!');
    expect(writeText).toHaveBeenCalledWith('doAfter(0, "world", "look")');
  });

  it('closes on backdrop click but not on dialog click', () => {
    const onClose = jest.fn();
    render(<UserScriptDialog title="t" dialogLabel="t" hint="h" variants={variants} onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
