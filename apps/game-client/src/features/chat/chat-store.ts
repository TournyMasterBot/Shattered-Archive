// apps/game-client/src/features/chat/chat-store.ts
import { ansiToHtml } from '@shatteredarchive/utils-client/ansi-to-html';
import type { ChatSubtype } from './chat-settings-store';

export interface ChatMessage {
  id: string;
  html: string;
  rawText: string;
  ts: number;
  subtype?: ChatSubtype;
}

let nextId = 1;
let globalMessages: ChatMessage[] = [];
const subscribers = new Set<(messages: ChatMessage[]) => void>();

export function appendChatLine(rawText: string, ts?: number, subtype?: ChatSubtype) {
  const t = typeof ts === 'number' ? ts : Date.now();

  const msg: ChatMessage = {
    id: String(nextId++),
    rawText,
    html: ansiToHtml(rawText),
    ts: t,
    subtype,
  };

  // keep bounded
  globalMessages = [...globalMessages, msg].slice(-500);
  subscribers.forEach((notify) => notify(globalMessages));
}

// Back-compat if you still call it elsewhere
export function appendChatRaw(rawText: string, ts?: number) {
  appendChatLine(rawText, ts, undefined);
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
