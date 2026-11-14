import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfirmDialog from './ConfirmDialog';

const request = { command: 'freeze', line: 'freeze Testchar', scope: '"freeze" changes a player and cannot be undone from this panel.' };

describe('ConfirmDialog', () => {
  it('names what is at stake and the exact line to send', () => {
    render(<ConfirmDialog request={request} onAnswer={jest.fn()} />);
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm command' });
    expect(dialog).toHaveTextContent(request.scope);
    expect(dialog).toHaveTextContent('Send freeze Testchar?');
  });

  it('gives the keyboard focus to the confirm button, so Enter confirms', () => {
    render(<ConfirmDialog request={request} onAnswer={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Send it' })).toHaveFocus();
  });

  it('answers yes once for Send it and no once for Cancel', () => {
    const onAnswer = jest.fn();
    const { rerender } = render(<ConfirmDialog request={request} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send it' }));
    expect(onAnswer.mock.calls).toEqual([[true]]);
    rerender(<ConfirmDialog request={request} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onAnswer.mock.calls).toEqual([[true], [false]]);
  });

  it('Escape answers no and does not reach the window, whose own Escape closes it', () => {
    const onAnswer = jest.fn();
    const outer = jest.fn();
    render(
      <div onKeyDown={outer}>
        <ConfirmDialog request={request} onAnswer={onAnswer} />
      </div>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Send it' }), { key: 'Escape' });
    expect(onAnswer).toHaveBeenCalledWith(false);
    expect(outer).not.toHaveBeenCalled();
  });

  it('ignores other keys, which still reach the window', () => {
    const onAnswer = jest.fn();
    const outer = jest.fn();
    render(
      <div onKeyDown={outer}>
        <ConfirmDialog request={request} onAnswer={onAnswer} />
      </div>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Send it' }), { key: 'a' });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(outer).toHaveBeenCalledTimes(1);
  });
});
