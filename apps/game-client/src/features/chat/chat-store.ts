// apps/game-client/src/features/chat/chat-store.ts
import { ansiToHtml } from '@shatteredarchive/utils-client/ansi-to-html';

export interface ChatMessage {
  id: string;
  html: string;
  rawText: string;
  ts: number;
}

let nextId = 1;
let globalMessages: ChatMessage[] = [];
const subscribers = new Set<(messages: ChatMessage[]) => void>();

export function appendChatRaw(rawText: string, ts?: number) {
  const t = typeof ts === 'number' ? ts : Date.now();

  const msg: ChatMessage = {
    id: String(nextId++),
    rawText,
    html: ansiToHtml(rawText),
    ts: t,
  };

  // keep bounded
  globalMessages = [...globalMessages, msg].slice(-500);
  subscribers.forEach((notify) => notify(globalMessages));
}

export function getChatMessages() {
  return globalMessages;
}

export function subscribeChat(notify: (messages: ChatMessage[]) => void) {
  subscribers.add(notify);
  // immediate sync
  notify(globalMessages);

  return () => {
    subscribers.delete(notify);
  };
}
