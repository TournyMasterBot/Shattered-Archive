import { renderHook, act } from '@testing-library/react';
import type React from 'react';
import { useCompactLayoutSizing } from './useCompactLayoutSizing';

const LS_RIGHT_WIDTH = 'shatteredArchive.compactLayout.rightPaneWidth';
const LS_CHAT_HEIGHT = 'shatteredArchive.compactLayout.chatPaneHeight';

function fireMouseDown(handler: (e: any) => void, clientX = 0, clientY = 0) {
  act(() => {
    handler({ preventDefault: () => {}, clientX, clientY } as any);
  });
}

function fireWindowMouseMove(clientX: number, clientY: number) {
  act(() => {
    window.dispatchEvent(Object.assign(new Event('mousemove'), { clientX, clientY }));
  });
}

function fireWindowMouseUp() {
  act(() => {
    window.dispatchEvent(new Event('mouseup'));
  });
}

// CSSProperties doesn't type custom properties as indexable; cast for assertions only.
function cssVars(vars: React.CSSProperties): Record<string, string | undefined> {
  return vars as Record<string, string | undefined>;
}

describe('useCompactLayoutSizing', () => {
  beforeEach(() => {
    window.localStorage.removeItem(LS_RIGHT_WIDTH);
    window.localStorage.removeItem(LS_CHAT_HEIGHT);
  });

  it('defaults right-pane-width to a sane pixel value', () => {
    const { result } = renderHook(() => useCompactLayoutSizing());
    expect(cssVars(result.current.layoutVars)['--right-pane-width']).toBeDefined();
  });

  it('leaves --sa-chat-pane-height unset by default so CSS falls back to 50%', () => {
    const { result } = renderHook(() => useCompactLayoutSizing());
    expect(cssVars(result.current.layoutVars)['--sa-chat-pane-height']).toBeUndefined();
  });

  it('reads persisted values on mount', () => {
    window.localStorage.setItem(LS_RIGHT_WIDTH, '300');
    window.localStorage.setItem(LS_CHAT_HEIGHT, '400');

    const { result } = renderHook(() => useCompactLayoutSizing());
    expect(cssVars(result.current.layoutVars)['--right-pane-width']).toBe('300px');
    expect(cssVars(result.current.layoutVars)['--sa-chat-pane-height']).toBe('400px');
  });

  it('dragging the vertical resizer updates --right-pane-width and persists it', () => {
    window.localStorage.setItem(LS_RIGHT_WIDTH, '300');
    const { result } = renderHook(() => useCompactLayoutSizing());

    fireMouseDown(result.current.handleVerticalResizeMouseDown, 500, 0);
    fireWindowMouseMove(450, 0); // dragged left by 50 -> right pane grows by 50
    fireWindowMouseUp();

    expect(cssVars(result.current.layoutVars)['--right-pane-width']).toBe('350px');
    expect(window.localStorage.getItem(LS_RIGHT_WIDTH)).toBe('350');
  });

  it('dragging the chat resizer from the unset default falls back to a fixed start height', () => {
    const { result } = renderHook(() => useCompactLayoutSizing());
    expect(cssVars(result.current.layoutVars)['--sa-chat-pane-height']).toBeUndefined();

    fireMouseDown(result.current.handleChatResizeMouseDown, 0, 500);
    fireWindowMouseMove(0, 460); // dragged up by 40
    fireWindowMouseUp();

    // chatPaneRef isn't attached to a real element via renderHook, so the
    // drag starts from FALLBACK_CHAT_HEIGHT (400) rather than a measured height.
    expect(cssVars(result.current.layoutVars)['--sa-chat-pane-height']).toBe('360px');
    expect(window.localStorage.getItem(LS_CHAT_HEIGHT)).toBe('360');
  });

  it('dragging the chat resizer updates --sa-chat-pane-height and persists it', () => {
    window.localStorage.setItem(LS_CHAT_HEIGHT, '400');
    const { result } = renderHook(() => useCompactLayoutSizing());

    fireMouseDown(result.current.handleChatResizeMouseDown, 0, 500);
    fireWindowMouseMove(0, 460); // dragged up by 40 -> chat pane shrinks by 40
    fireWindowMouseUp();

    expect(cssVars(result.current.layoutVars)['--sa-chat-pane-height']).toBe('360px');
    expect(window.localStorage.getItem(LS_CHAT_HEIGHT)).toBe('360');
  });
});
