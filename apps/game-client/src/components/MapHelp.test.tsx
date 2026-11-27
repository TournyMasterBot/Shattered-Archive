import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import MapHelp from './MapHelp';

describe('MapHelp', () => {
  it('covers where you are, moving around, the settings, fog of war and your own rooms', () => {
    render(<MapHelp onBack={() => undefined} />);
    for (const heading of ['About the map', 'Where you are', 'Moving around', 'Settings (the gear)', 'Your own rooms']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText(/Fog of war/)).toBeInTheDocument();
    expect(screen.getByText(/never changes the published map/)).toBeInTheDocument();
  });

  it('explains mazes and tangled exits: the chips on the edge, round and square, the line drawn for the selected room, the hexagons and the labels', () => {
    render(<MapHelp onBack={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Mazes and tangled exits' })).toBeInTheDocument();
    const text = screen.getByText(/small chip on the edge of the room/).textContent ?? '';
    expect(text).toContain('a round chip means the exit does not lead straight on');
    expect(text).toContain('a square one means it lands far away');
    expect(text).toContain('Select the room and a line is drawn out of each exit');
    expect(text).toContain('each in its own colour');
    expect(text).toContain('A small arrow on a plain line marks a one-way join');
    expect(text).toContain('amber octagons');
    const labels = screen.getByText(/Small labels on the rooms of a maze/).textContent ?? '';
    for (const word of ['IN is a way into the maze', 'OUT is an exit to another area', 'END is a dead end', '1-WAY is a room you can land in']) expect(labels).toContain(word);
  });

  it('explains the red you-are-here dot and its button', () => {
    render(<MapHelp onBack={() => undefined} />);
    const item = screen.getByText(/sits on your room/).closest('li');
    expect(item).toHaveTextContent('fainter when it is only probably this room');
    expect(item).toHaveTextContent('turns it off and on');
    expect(item).toHaveTextContent('only shows when the map knows where you are');
  });

  it('explains the cloud backup: only on Sync now, ids only, and how to erase it', () => {
    render(<MapHelp onBack={() => undefined} />);
    const item = screen.getByText(/Nothing is sent until you press it/).closest('li');
    expect(item).toHaveTextContent('Cloud backup');
    expect(item).toHaveTextContent('Sync now');
    expect(item).toHaveTextContent('ids only');
    expect(item).toHaveTextContent('Erase my backup…');
  });

  it('calls onBack from its Back button', () => {
    const onBack = jest.fn();
    render(<MapHelp onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: '← Back to the map' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
