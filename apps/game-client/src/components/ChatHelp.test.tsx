import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatHelp from './ChatHelp';

describe('ChatHelp', () => {
  it('is a labelled article that explains the unread dot in player terms', () => {
    render(<ChatHelp onBack={jest.fn()} />);

    const article = screen.getByRole('article', { name: 'Chat panes help' });
    expect(article).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'About chat panes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The unread dot' })).toBeInTheDocument();
    expect(article).toHaveTextContent('Unread dot on pane tabs');
    expect(article).toHaveTextContent('never has one');
    expect(article).toHaveTextContent('You tell');
  });

  it('calls onBack once when Back is pressed', () => {
    const onBack = jest.fn();
    render(<ChatHelp onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: /Back to chat settings/ }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
