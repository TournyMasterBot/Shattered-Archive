import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type React from 'react';

const MIN_RIGHT_WIDTH = 220;
const MAX_RIGHT_WIDTH = 640;
const MIN_CHAT_HEIGHT = 120;
const MAX_CHAT_HEIGHT = 900;

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

  const [chatHeight, setChatHeight] = useState(() => {
    try {
      const raw = window.localStorage.getItem(LS_CHAT_HEIGHT);
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? clamp(n, MIN_CHAT_HEIGHT, MAX_CHAT_HEIGHT) : 400;
    } catch {
      return 400;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_RIGHT_WIDTH, String(rightWidth));
    } catch {
      // ignore
    }
  }, [rightWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_CHAT_HEIGHT, String(chatHeight));
    } catch {
      // ignore
    }
  }, [chatHeight]);

  const layoutVars: CSSProperties = {
    '--right-pane-width': `${rightWidth}px`,
    '--sa-chat-pane-height': `${chatHeight}px`,
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
      const startHeight = chatHeight;

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

  return { layoutVars, handleVerticalResizeMouseDown, handleChatResizeMouseDown };
}
