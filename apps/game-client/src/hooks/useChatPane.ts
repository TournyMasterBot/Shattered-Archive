// apps/game-client/src/hooks/useChatPane.ts
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useChatLog } from './useChatLog';

export function useChatPane() {
  const { messages } = useChatLog();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showJump, setShowJump] = useState(false);

  // Scroll to bottom when new messages arrive and autoScroll is enabled
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, autoScroll]);

  const handleScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    const el = e.currentTarget;
    const threshold = 16; // px from bottom to still count as "live"
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;

    if (atBottom) {
      if (!autoScroll) setAutoScroll(true);
      if (showJump) setShowJump(false);
    } else {
      if (autoScroll) setAutoScroll(false);
      if (!showJump) setShowJump(true);
    }
  };

  const handleJumpToLive = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
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
