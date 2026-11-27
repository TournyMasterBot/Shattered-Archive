import { render, screen } from '@testing-library/react';
import { MapProvider } from '../state/mapStore';
import { STORAGE_KEY } from '../state/persist';
import { sampleDoc } from '../testing/fixtures';
import RoomForm from './RoomForm';

/** The Mapper's room form, rendered inside its real provider. The provider reads the saved document from the browser's storage. */

class FakeChannel {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  postMessage(): void {}
  close(): void {}
}

beforeAll(() => {
  Object.assign(globalThis, { BroadcastChannel: FakeChannel });
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleDoc()));
});

const shown = (): string[] => screen.queryAllByRole('textbox').map((box) => (box as HTMLInputElement).value);

describe('RoomForm', () => {
  it('shows the form of a room that is in the document, filled from the room', () => {
    render(
      <MapProvider>
        <RoomForm vnum="B" />
      </MapProvider>,
    );
    expect(shown()).toContain('Beta');
  });

  it('renders nothing for a room that is not in the document', () => {
    const { container } = render(
      <MapProvider>
        <RoomForm vnum="missing" />
      </MapProvider>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('can go from no room to a room and back without breaking the order of its hooks', () => {
    // before the form's hooks were moved below the "no such room" check, this sequence made React report a change in the order of
    // hooks (a console error, and in some sequences a thrown "Rendered more hooks than during the previous render")
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = render(
      <MapProvider>
        <RoomForm vnum="missing" />
      </MapProvider>,
    );
    expect(view.container.innerHTML).toBe('');
    view.rerender(
      <MapProvider>
        <RoomForm vnum="A" />
      </MapProvider>,
    );
    expect(shown()).toContain('Alpha');
    view.rerender(
      <MapProvider>
        <RoomForm vnum="missing" />
      </MapProvider>,
    );
    expect(view.container.innerHTML).toBe('');
    view.rerender(
      <MapProvider>
        <RoomForm vnum="C" />
      </MapProvider>,
    );
    expect(shown()).toContain('Gamma');
    expect(errors.mock.calls.map((call) => String(call[0]))).toEqual([]);
    errors.mockRestore();
  });
});
