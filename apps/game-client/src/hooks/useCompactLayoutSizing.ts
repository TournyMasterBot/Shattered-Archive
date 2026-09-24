import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type React from 'react';

const MIN_RIGHT_WIDTH = 220;
const MAX_RIGHT_WIDTH = 640;
const MIN_CHAT_HEIGHT = 120;
const MAX_CHAT_HEIGHT = 900;
// Used only as a drag-start fallback if the chat pane hasn't rendered yet
// when a user grabs the resizer straight out of the (unset) 50% default.
const FALLBACK_CHAT_HEIGHT = 400;

const LS_RIGHT_WIDTH = 'shatteredArchive.compactLayout.rightPaneWidth';
const LS_CHAT_HEIGHT = 'shatteredArchive.compactLayout.chatPaneHeight';

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function useCompactLayoutSizing() {
  const [rightWidth, setRightWidth] = useState(() => {
    try {
      const raw = window.localStorage.getItem(LS_RIGHT_WIDTH);
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? clamp(n, MIN_RIGHT_WIDTH, MAX_RIGHT_WIDTH) : 320;
    } catch {
      return 320;
    }
  });

  // null = no explicit override yet; CSS falls back to a 50%-of-column
  // default (var(--sa-chat-pane-height, 50%)) so the chat pane starts
  // proportional to the right column instead of a fixed pixel guess.
  const [chatHeight, setChatHeight] = useState<number | null>(() => {
    try {
      const raw = window.localStorage.getItem(LS_CHAT_HEIGHT);
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? clamp(n, MIN_CHAT_HEIGHT, MAX_CHAT_HEIGHT) : null;
    } catch {
      return null;
    }
  });

  const chatPaneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_RIGHT_WIDTH, String(rightWidth));
    } catch {
      // ignore
    }
  }, [rightWidth]);

  useEffect(() => {
    if (chatHeight === null) return;
    try {
      window.localStorage.setItem(LS_CHAT_HEIGHT, String(chatHeight));
    } catch {
      // ignore
    }
  }, [chatHeight]);

  const layoutVars: CSSProperties = {
    '--right-pane-width': `${rightWidth}px`,
    ...(chatHeight !== null ? { '--sa-chat-pane-height': `${chatHeight}px` } : {}),
  } as CSSProperties;

  const handleVerticalResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = rightWidth;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        setRightWidth(clamp(startWidth + delta, MIN_RIGHT_WIDTH, MAX_RIGHT_WIDTH));
      };
      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = '';
      };

      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [rightWidth],
  );

  const handleChatResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = chatHeight ?? chatPaneRef.current?.getBoundingClientRect().height ?? FALLBACK_CHAT_HEIGHT;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientY - startY; // dragged up (negative) => shrink
        setChatHeight(clamp(startHeight + delta, MIN_CHAT_HEIGHT, MAX_CHAT_HEIGHT));
      };
      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = '';
      };

      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [chatHeight],
  );

  return { layoutVars, handleVerticalResizeMouseDown, handleChatResizeMouseDown, chatPaneRef };
}
