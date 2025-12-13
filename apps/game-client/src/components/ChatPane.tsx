// apps/game-client/src/components/ChatPane.tsx
import React from 'react';
import styles from '../styles/ChatPane.module.scss';
import { useChatPane } from '../hooks/useChatPane';

export const ChatPane: React.FC = () => {
  const { messages, scrollRef, showJump, handleScroll, handleJumpToLive } = useChatPane();

  return (
    <div className={styles.chatRoot}>
      <div ref={scrollRef} className={styles.chatScroll} onScroll={handleScroll}>
        {messages.map((msg) => (
          <div key={msg.id} className={styles.chatRow}>
            <div
              className={styles.chatBubble}
              // ANSI → HTML already escaped / sanitized upstream
              dangerouslySetInnerHTML={{ __html: msg.html }}
            />
          </div>
        ))}

        {messages.length === 0 && <div className={styles.chatEmpty}>No chat yet.</div>}
      </div>

      {showJump && (
        <button type="button" className={styles.chatJumpToLive} onClick={handleJumpToLive}>
          Jump to live
        </button>
      )}
    </div>
  );
};

export default ChatPane;
