// apps/game-client/src/hooks/useChatPane.ts
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type React from 'react';
import { useChatLog } from './useChatLog';

export function useChatPane() {
  const { messages } = useChatLog();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [autoScroll, setAutoScroll] = useState(true);
  const [showJump, setShowJump] = useState(false);

  // Prevent programmatic scrolls (jump-to-live / autoscroll) from toggling state via onScroll.
  const ignoreNextScrollRef = useRef(false);

  const threshold = 16; // px from bottom to still count as "live"

  const isAtBottom = (el: HTMLDivElement) => {
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return Math.abs(distanceFromBottom) <= threshold;
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;

    ignoreNextScrollRef.current = true;

    // Defer the actual scroll to the next frame so DOM/layout is stable.
    requestAnimationFrame(() => {
      const el2 = scrollRef.current;
      if (!el2) return;

      el2.scrollTop = el2.scrollHeight;

      // Allow the scroll event to fire, but don't let it flip state.
      requestAnimationFrame(() => {
        ignoreNextScrollRef.current = false;

        // After settling, ensure we reflect the true bottom state.
        const atBottom = isAtBottom(el2);
        if (atBottom) {
          setAutoScroll(true);
          setShowJump(false);
        }
      });
    });
  };

  // Scroll to bottom when new messages arrive and autoScroll is enabled
  useLayoutEffect(() => {
    if (!autoScroll) return;
    if (!scrollRef.current) return;
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, autoScroll]);

  const handleScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    if (ignoreNextScrollRef.current) return;

    const el = e.currentTarget;
    const atBottom = isAtBottom(el);

    if (atBottom) {
      setAutoScroll(true);
      setShowJump(false);
    } else {
      setAutoScroll(false);
      setShowJump(true);
    }
  };

  const handleJumpToLive = () => {
    scrollToBottom();
    setAutoScroll(true);
    setShowJump(false);
  };

  return {
    messages,
    scrollRef,
    showJump,
    handleScroll,
    handleJumpToLive,
  };
}
