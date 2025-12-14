// apps/game-client/src/hooks/useChatLog.ts
import { useEffect, useState } from 'react';
import { ChatMessage, getChatMessages, subscribeChat } from '../features/chat/chat-store';

/**
 * Hook: exposes a live view of the global chat log.
 * Chat is captured upstream (useGameConnection) even if ChatPane is not mounted.
 */
export function useChatLog() {
  const [messages, setMessages] = useState<ChatMessage[]>(getChatMessages());

  useEffect(() => {
    return subscribeChat(setMessages);
  }, []);

  return { messages };
}
