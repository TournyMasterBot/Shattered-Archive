import { fireEvent, render, screen } from '@testing-library/react';

import { BUILTIN_ROLES } from '../../domain/roleCatalog.js';
import { roleParchmentCommands } from '../../domain/roleParchment.js';
import RoleParchmentModal from './RoleParchmentModal.js';

const umbraseer = BUILTIN_ROLES.find((r) => r.id === 'umbraseer')!;

describe('RoleParchmentModal', () => {
  it('shows the exact command sequence for the role', () => {
    render(<RoleParchmentModal role={umbraseer} onClose={jest.fn()} />);
    const textarea = screen.getByLabelText('Role parchment commands') as HTMLTextAreaElement;
    expect(textarea.value).toBe(roleParchmentCommands(umbraseer));
    expect(textarea.value).toContain('dip quill ink');
    expect(textarea.value).toContain('write parch title Umbral Cloak & Soulsteel Dagger Role');
    expect(textarea.value).toContain('read soulsteel');
  });

  it('titles the modal by role, not by any player', () => {
    render(<RoleParchmentModal role={umbraseer} onClose={jest.fn()} />);
    expect(screen.getByText('Umbraseer role parchment')).toBeDefined();
  });

  it('appends the bag put command and notes the bag number in the title when a bag is given', () => {
    render(<RoleParchmentModal role={umbraseer} bag={{ number: 2, keyword: 'sack' }} onClose={jest.fn()} />);
    const textarea = screen.getByLabelText('Role parchment commands') as HTMLTextAreaElement;
    expect(textarea.value).toBe(roleParchmentCommands(umbraseer, { number: 2, keyword: 'sack' }));
    expect(textarea.value.split('\n').at(-1)).toBe('put parch 2.sack');
    expect(screen.getByText('Umbraseer role parchment — Bag 2')).toBeDefined();
  });

  it('copies the commands to the clipboard and shows confirmation', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<RoleParchmentModal role={umbraseer} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Copy commands'));

    await screen.findByText('Copied!');
    expect(writeText).toHaveBeenCalledWith(roleParchmentCommands(umbraseer));
  });

  it('closes on backdrop click but not on dialog click', () => {
    const onClose = jest.fn();
    render(<RoleParchmentModal role={umbraseer} onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
