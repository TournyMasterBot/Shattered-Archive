import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { getCopilotRuntime } from '../features/copilot/loader';
import { AccessibilitySettingsModal } from './AccessibilitySettingsModal';
import { AudioSettingsModal } from './AudioSettingsModal';
import CopilotWindow from './CopilotWindow';
import { GraphicsSettingsModal } from './GraphicsSettingsModal';
import ScriptingHelpModal from './ScriptingHelpModal';
import { UserStyleOverrideModal } from './UserStyleOverrideModal';

// The real windows together: what is drawn on top, what a drag or a click does to it, and which window the Escape key closes.

const original = globalThis.fetch;
beforeEach(() => {
  // jsdom has no IntersectionObserver, which the help modal's table of contents uses
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  localStorage.clear();
  getCopilotRuntime().enabled.set(true);
  globalThis.fetch = (async (url: unknown) => {
    const path = new URL(String(url)).pathname;
    const body = path === '/suggestions' ? { suggestions: [] } : path === '/tickets' ? { tickets: [] } : { connected: true, stale: false, staleAfterSeconds: 60, lastEventAgeSeconds: 1, inFight: false, room: null };
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = original;
});

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
const noop = (): void => undefined;
const style = (onClose: () => void) => (
  <UserStyleOverrideModal isOpen appliedCss="" draftCss="" onChangeDraft={noop} onSave={noop} onPreview={noop} onDiscardDraft={noop} onClose={onClose} />
);
const z = (element: HTMLElement): number => Number(element.style.zIndex);
const copilot = (): HTMLElement => screen.getByRole('dialog', { name: 'Copilot' });
/** The element that carries the modal's z-index: the full-screen overlay around the dialog. */
const overlayOf = (): HTMLElement => screen.getByRole('dialog', { name: 'Custom CSS overrides' });

describe('the window stack across real windows', () => {
  it('draws the window opened last on top, and puts a window on top when it is pressed (the start of a drag)', async () => {
    render(
      <>
        <CopilotWindow isOpen onClose={noop} />
        {style(noop)}
      </>,
    );
    await settle();
    expect(z(overlayOf())).toBeGreaterThan(z(copilot()));

    fireEvent.pointerDown(screen.getByText('Copilot')); // the header: a drag starts here
    expect(z(copilot())).toBeGreaterThan(z(overlayOf()));
  });

  it('two draggable windows trade places: drag the one underneath and it comes up, then drag the other and that one does', async () => {
    render(
      <>
        <ScriptingHelpModal isOpen onClose={noop} />
        <CopilotWindow isOpen onClose={noop} />
      </>,
    );
    await settle();
    const help = screen.getByText('Scripting Help').parentElement!.parentElement as HTMLElement;
    expect(z(copilot())).toBeGreaterThan(z(help)); // Copilot was opened last

    fireEvent.pointerDown(screen.getByText('Scripting Help')); // its header: a drag starts
    expect(z(help)).toBeGreaterThan(z(copilot()));

    fireEvent.pointerDown(screen.getByText('Copilot'));
    expect(z(copilot())).toBeGreaterThan(z(help));
  });

  it('Escape closes the top-most window only, wherever the focus is, and the next press closes the one below', async () => {
    const closed: string[] = [];
    const view = render(
      <>
        <CopilotWindow isOpen onClose={() => closed.push('copilot')} />
        {style(() => closed.push('style'))}
      </>,
    );
    await settle();
    fireEvent.keyDown(document.body, { key: 'Escape' }); // the focus is on the page, not in either window
    expect(closed).toEqual(['style']);
    view.rerender(<CopilotWindow isOpen onClose={() => closed.push('copilot')} />); // the host closed the modal
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(closed).toEqual(['style', 'copilot']);
  });

  it('Escape closes the window that was dragged to the front first', async () => {
    const closed: string[] = [];
    render(
      <>
        <CopilotWindow isOpen onClose={() => closed.push('copilot')} />
        {style(() => closed.push('style'))}
      </>,
    );
    await settle();
    fireEvent.pointerDown(screen.getByText('Copilot'));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(closed).toEqual(['copilot']);
  });

  it.each([
    ['Accessibility settings', (onClose: () => void) => <AccessibilitySettingsModal isOpen onClose={onClose} />],
    ['Audio settings', (onClose: () => void) => <AudioSettingsModal isOpen onClose={onClose} />],
    ['Graphics settings', (onClose: () => void) => <GraphicsSettingsModal isOpen onClose={onClose} />],
  ])('%s: Escape closes it, and it is drawn above a window that was open before it', async (_name, modal) => {
    const onClose = jest.fn();
    render(<CopilotWindow isOpen onClose={noop} />);
    await settle();
    const opened = render(modal(onClose)); // opened after Copilot
    const surface = opened.container.firstElementChild as HTMLElement; // the full-screen overlay that carries the z-index
    expect(z(surface)).toBeGreaterThan(z(copilot()));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('resizing by the corner grip', () => {
    const drag = (grip: HTMLElement, from: [number, number], to: [number, number]): void => {
      // jsdom has no PointerEvent: a MouseEvent with the pointer event's name carries the same coordinates
      act(() => void grip.dispatchEvent(new MouseEvent('pointerdown', { clientX: from[0], clientY: from[1], button: 0, bubbles: true })));
      act(() => void document.dispatchEvent(new MouseEvent('pointermove', { clientX: to[0], clientY: to[1], bubbles: true })));
      act(() => void document.dispatchEvent(new MouseEvent('pointerup', { clientX: to[0], clientY: to[1], bubbles: true })));
    };
    let rectSpy: jest.SpyInstance;
    beforeEach(() => {
      // jsdom has no layout: the modal is 400 x 300 with its top-left corner at (100, 50)
      rectSpy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, width: 400, height: 300, right: 500, bottom: 350, x: 100, y: 50, toJSON: () => ({}) } as DOMRect);
    });
    afterEach(() => rectSpy.mockRestore());

    it.each([
      // an overlay modal is centered by the page, so it grows on both sides: the pointer moves twice as far as the corner
      ['Accessibility settings', (c: () => void) => <AccessibilitySettingsModal isOpen onClose={c} />, 600, 400],
      ['Audio settings', (c: () => void) => <AudioSettingsModal isOpen onClose={c} />, 600, 400],
      ['Graphics settings', (c: () => void) => <GraphicsSettingsModal isOpen onClose={c} />, 600, 400],
      ['Custom CSS overrides', (c: () => void) => style(c), 600, 400],
      // a window that sits where it was dragged to keeps its top-left corner and the corner follows the pointer
      // (400 x 300 plus the 100 x 50 of the drag is 500 x 350, but its minimum height is 360)
      ['Scripting help', (c: () => void) => <ScriptingHelpModal isOpen onClose={c} />, 500, 360],
    ])('%s: the grip resizes it, and the size is back when it is opened again', (_name, modal, width, height) => {
      const first = render(modal(noop));
      const grips = first.container.querySelectorAll<HTMLElement>('[title="Drag to resize"]');
      expect(grips).toHaveLength(1);
      drag(grips[0], [500, 350], [600, 400]);
      const root = grips[0].parentElement as HTMLElement;
      expect(root.style.width).toBe(`${width}px`);
      expect(root.style.height).toBe(`${height}px`);
      first.unmount();

      const second = render(modal(noop));
      const reopened = second.container.querySelector<HTMLElement>('[title="Drag to resize"]')!.parentElement as HTMLElement;
      expect(reopened.style.width).toBe(`${width}px`);
      expect(reopened.style.height).toBe(`${height}px`);
    });
  });

  it('Escape in the Copilot window still closes its help first, from anywhere on the page', async () => {
    const closed: string[] = [];
    render(<CopilotWindow isOpen onClose={() => closed.push('copilot')} />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /help|info/i }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(closed).toEqual([]);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(closed).toEqual(['copilot']);
  });
});
