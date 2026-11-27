import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { UserStyleOverrideModal, type UserStyleOverrideModalProps } from './UserStyleOverrideModal';

// Pins what the modal does for its parent: nothing while closed, a dialog while open, and Preview / Save always act on the
// latest draft. The hooks now run on every render and the early return comes after them (the rules-of-hooks lint rule guards
// that ordering; React itself tolerates a return before ALL hooks, so no test can observe the difference at runtime).

function props(over: Partial<UserStyleOverrideModalProps> = {}): UserStyleOverrideModalProps {
  return {
    isOpen: true,
    appliedCss: 'body { color: red; }',
    draftCss: 'body { color: red; }',
    onChangeDraft: jest.fn(),
    onSave: jest.fn(),
    onPreview: jest.fn(),
    onDiscardDraft: jest.fn(),
    onClose: jest.fn(),
    ...over,
  };
}

describe('UserStyleOverrideModal', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<UserStyleOverrideModal {...props({ isOpen: false })} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the dialog while open', () => {
    render(<UserStyleOverrideModal {...props()} />);

    expect(screen.getByRole('dialog', { name: 'Custom CSS overrides' })).toBeInTheDocument();
  });

  it('survives being closed and reopened by its parent (the hook order is the same every render)', () => {
    const { rerender } = render(<UserStyleOverrideModal {...props({ isOpen: false })} />);

    rerender(<UserStyleOverrideModal {...props({ isOpen: true })} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(<UserStyleOverrideModal {...props({ isOpen: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<UserStyleOverrideModal {...props({ isOpen: true })} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('says whether the draft differs from what is applied, and disables Preview and Save until it does', () => {
    const { rerender } = render(<UserStyleOverrideModal {...props()} />);
    expect(screen.getByText('Currently applied')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save & Apply' })).toBeDisabled();

    rerender(<UserStyleOverrideModal {...props({ draftCss: 'body { color: blue; }' })} />);

    expect(screen.getByText('Draft not applied')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save & Apply' })).toBeEnabled();
  });

  it('saves and previews the draft the parent last passed in', () => {
    const onSave = jest.fn();
    const onPreview = jest.fn();
    const { rerender } = render(<UserStyleOverrideModal {...props({ onSave, onPreview })} />);

    rerender(<UserStyleOverrideModal {...props({ onSave, onPreview, draftCss: 'a { top: 1px; }' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save & Apply' }));

    expect(onPreview).toHaveBeenCalledWith('a { top: 1px; }');
    expect(onSave).toHaveBeenCalledWith('a { top: 1px; }');
  });

  it('reports typing to the parent, and saves what was typed even before the parent hands it back', () => {
    const onChangeDraft = jest.fn();
    const onSave = jest.fn();
    render(<UserStyleOverrideModal {...props({ onChangeDraft, onSave, draftCss: 'x', appliedCss: 'y' })} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'typed css' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & Apply' }));

    expect(onChangeDraft).toHaveBeenCalledWith('typed css');
    expect(onSave).toHaveBeenCalledWith('typed css');
  });
});

describe('UserStyleOverrideModal footer actions', () => {
  it('Discard Draft is only available when there is something to discard', () => {
    render(<UserStyleOverrideModal {...props()} />);

    expect(screen.getByRole('button', { name: 'Discard Draft' })).toBeDisabled();
  });

  it('Discard Draft throws the draft away and then closes', () => {
    const calls: string[] = [];
    const onDiscardDraft = jest.fn(() => calls.push('discard'));
    const onClose = jest.fn(() => calls.push('close'));
    render(<UserStyleOverrideModal {...props({ draftCss: 'a { top: 1px; }', onDiscardDraft, onClose })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Discard Draft' }));

    expect(calls).toEqual(['discard', 'close']);
  });

  it('Cancel and the close button close without touching the draft', () => {
    const onClose = jest.fn();
    const onDiscardDraft = jest.fn();
    render(<UserStyleOverrideModal {...props({ draftCss: 'a { top: 1px; }', onClose, onDiscardDraft })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDiscardDraft).not.toHaveBeenCalled();
  });
});
