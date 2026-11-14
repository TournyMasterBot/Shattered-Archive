import { fireEvent, render, screen } from '@testing-library/react';
import { candidatesMap } from '../../testing/neutralFixtures';
import ZoomControl from './ZoomControl';

const map = candidatesMap();
const levels = (): HTMLElement[] => screen.getAllByRole('button').filter((b) => b.closest('[role="toolbar"]') !== null);

describe('ZoomControl', () => {
  it('shows the name at each level down to the focus, and a dash for the levels below it', () => {
    render(<ZoomControl map={map} focus={{ level: 'area', id: 'a-farm' }} onFocus={() => undefined} />);
    expect(levels().map((b) => b.textContent)).toEqual(['ContinentGreenmarch', 'AreaNorth Farm', 'Subzone–', 'Room–']);
    expect(levels().map((b) => (b as HTMLButtonElement).disabled)).toEqual([false, false, true, true]);
    expect(levels()[1].getAttribute('aria-current')).toBe('step');
    expect(levels()[0].getAttribute('aria-current')).toBeNull();
  });

  it('zooms to a level when its button is pressed', () => {
    const onFocus = jest.fn();
    render(<ZoomControl map={map} focus={{ level: 'room', id: 'r-barn' }} onFocus={onFocus} />);
    fireEvent.click(levels()[1]);
    expect(onFocus).toHaveBeenCalledWith({ level: 'area', id: 'a-farm' });
    fireEvent.click(levels()[2]);
    expect(onFocus).toHaveBeenLastCalledWith({ level: 'subzone', id: 's-fields' });
  });

  it('zooms out one level with its own button, which is off at the continent', () => {
    const onFocus = jest.fn();
    const view = render(<ZoomControl map={map} focus={{ level: 'room', id: 'r-barn' }} onFocus={onFocus} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out one level' }));
    expect(onFocus).toHaveBeenCalledWith({ level: 'subzone', id: 's-fields' });
    view.rerender(<ZoomControl map={map} focus={{ level: 'continent', id: 'c-green' }} onFocus={onFocus} />);
    expect((screen.getByRole('button', { name: 'Zoom out one level' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('is one tab stop: only the level in focus can be tabbed to', () => {
    render(<ZoomControl map={map} focus={{ level: 'subzone', id: 's-fields' }} onFocus={() => undefined} />);
    expect(levels().map((b) => b.tabIndex)).toEqual([-1, -1, 0, -1]);
  });

  it('moves between the levels with the arrow keys, Home and End, without leaving the toolbar or passing a level that does not exist', () => {
    render(<ZoomControl map={map} focus={{ level: 'subzone', id: 's-fields' }} onFocus={() => undefined} />);
    const toolbar = screen.getByRole('toolbar', { name: 'Zoom level' });
    const [continent, area, subzone, room] = levels();
    subzone.focus();
    fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(area);
    fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(continent);
    fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(continent); // stops at the first
    fireEvent.keyDown(toolbar, { key: 'End' });
    expect(document.activeElement).toBe(subzone); // the last level that exists, not the disabled room
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(subzone);
    expect(document.activeElement).not.toBe(room);
    fireEvent.keyDown(toolbar, { key: 'Home' });
    expect(document.activeElement).toBe(continent);
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(area);
  });

  it('leaves other keys alone', () => {
    render(<ZoomControl map={map} focus={{ level: 'area', id: 'a-farm' }} onFocus={() => undefined} />);
    const area = levels()[1];
    area.focus();
    const notPrevented = fireEvent.keyDown(screen.getByRole('toolbar'), { key: 'a' });
    expect(notPrevented).toBe(true);
    expect(document.activeElement).toBe(area);
  });

  it('shows every level as unavailable with nothing in focus, and the first can still be reached', () => {
    render(<ZoomControl map={{ version: 1, continents: [], links: [] }} focus={null} onFocus={() => undefined} />);
    expect(levels().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect((screen.getByRole('button', { name: 'Zoom out one level' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
