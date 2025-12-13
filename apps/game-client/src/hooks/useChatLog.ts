// apps/game-client/src/hooks/useChatLog.ts
import { useEffect, useState } from 'react';
import { ansiToHtml } from '@shatteredarchive/utils-client/ansi-to-html';

export interface ChatMessage {
  id: string;
  html: string;
  ts: number;
}

/**
 * Global chat log state so it survives tab changes / unmounts.
 */
let nextId = 1;
let globalMessages: ChatMessage[] = [];

/**
 * All active React subscribers (setState functions).
 */
const subscribers = new Set<(messages: ChatMessage[]) => void>();

let hasAttachedListener = false;

type ChatLineDetail = {
  text?: string; // raw ANSI text from the MUD
  html?: string; // optional pre-rendered HTML
  ts?: number; // optional timestamp
};

function handleChatLineEvent(ev: Event) {
  const custom = ev as CustomEvent<ChatLineDetail>;
  const detail = custom.detail ?? {};

  const ts = typeof detail.ts === 'number' ? detail.ts : Date.now();
  const rawText = detail.text ?? '';
  const html = detail.html ?? ansiToHtml(rawText);

  const msg: ChatMessage = {
    id: String(nextId++),
    html,
    ts,
  };

  // Append and keep a bounded history
  globalMessages = [...globalMessages, msg].slice(-500);

  // Fan out to all hooked components
  subscribers.forEach((notify) => notify(globalMessages));
}

/**
 * Hook: exposes a live view of the global chat log.
 * State persists even if the Chat tab is unmounted.
 */
export function useChatLog() {
  const [messages, setMessages] = useState<ChatMessage[]>(globalMessages);

  useEffect(() => {
    subscribers.add(setMessages);
    // In case messages arrived before this subscriber mounted
    setMessages(globalMessages);

    if (!hasAttachedListener && typeof window !== 'undefined') {
      window.addEventListener('dsl:chat-line', handleChatLineEvent);
      hasAttachedListener = true;
    }

    return () => {
      subscribers.delete(setMessages);
      // We intentionally do NOT remove the window listener here,
      // so the global log keeps accumulating while the tab is hidden.
    };
  }, []);

  return { messages };
}
