import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { __resetMapWorldsForTests, activeMapWorld, mapWorldName, pickedMapWorldId, registerMapWorld, setActiveMapWorld } from '../features/worldmap/world';
import MapWorldPicker from './MapWorldPicker';

const OTHER = { id: 'other', label: 'Other game', mapPrefix: '/api/world-map/other' };

describe('MapWorldPicker', () => {
  beforeEach(() => __resetMapWorldsForTests());

  it('draws nothing when the build knows a single world: no control and no text', () => {
    const { container } = render(<MapWorldPicker />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names a world by its label, or by its id in capitals when it has none', () => {
    expect(mapWorldName({ id: 'dsl', label: '', mapPrefix: '/x' })).toBe('DSL');
    expect(mapWorldName(OTHER)).toBe('Other game');
  });

  it('lists Automatic (naming what the connection chose) and every world, and starts on Automatic', () => {
    registerMapWorld(OTHER);
    render(<MapWorldPicker />);
    const select = screen.getByRole('combobox', { name: 'Which map to show' }) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.text)).toEqual(['Automatic (DSL)', 'DSL', 'Other game']);
    expect(select.value).toBe('auto');
  });

  it('picking a world shows it, Automatic goes back to following the connection, and the label of Automatic follows the connection', () => {
    registerMapWorld(OTHER);
    render(<MapWorldPicker />);
    const select = screen.getByRole('combobox', { name: 'Which map to show' }) as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'other' } });
    expect(activeMapWorld().id).toBe('other');
    expect(pickedMapWorldId()).toBe('other');
    expect(select.value).toBe('other');

    act(() => setActiveMapWorld('other'));
    fireEvent.change(select, { target: { value: 'dsl' } });
    expect(activeMapWorld().id).toBe('dsl');
    expect(Array.from(select.options)[0]?.text).toBe('Automatic (Other game)');

    fireEvent.change(select, { target: { value: 'auto' } });
    expect(pickedMapWorldId()).toBeNull();
    expect(activeMapWorld().id).toBe('other');
    expect(select.value).toBe('auto');
  });

  it('appears when a second world is registered after it was drawn', () => {
    const { container } = render(<MapWorldPicker />);
    expect(container).toBeEmptyDOMElement();
    act(() => registerMapWorld(OTHER));
    expect(screen.getByRole('combobox', { name: 'Which map to show' })).toBeInTheDocument();
  });
});
