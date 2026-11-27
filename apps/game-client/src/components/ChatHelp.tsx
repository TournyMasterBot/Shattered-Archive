// apps/game-client/src/components/ChatHelp.tsx
//
// The chat panel's help: what the channel tabs are and how the unread dot works. It replaces the settings rows in the gear menu while the
// blue (i) is on. Production feature, like the panel. The developer side is in docs/game/chat-panes.md.
import React from 'react';
import styles from '../styles/HelpInfo.module.scss';

export interface ChatHelpProps {
  onBack: () => void;
}

const ChatHelp: React.FC<ChatHelpProps> = ({ onBack }) => (
  <article className={styles.help} aria-label="Chat panes help">
    <button type="button" className={styles.helpBack} onClick={onBack}>
      ← Back to chat settings
    </button>
    <h3>About chat panes</h3>
    <p>
      The Chat panel keeps what is said to you in one place. <strong>All</strong> shows every line. With{' '}
      <strong>Enable Chat Panes</strong> on, each channel (tells, gossip, clan and so on) also gets its own tab once it
      has a message.
    </p>

    <h4>The unread dot</h4>
    <ul>
      <li>
        Turn on <strong>Unread dot on pane tabs</strong> in this menu. It also needs <strong>Strict Chat Format</strong>{' '}
        and <strong>Enable Chat Panes</strong>, because only then does each line belong to a channel. Until they are on,
        the option is greyed out and says what is missing.
      </li>
      <li>
        When a message arrives for a channel tab you are not looking at, a red dot appears on that tab. The{' '}
        <strong>All</strong> tab never has one.
      </li>
      <li>Click the tab to clear its dot. It also clears by itself while you are on that tab.</li>
      <li>
        Lines you say yourself (<em>You tell ...</em>) never raise a dot.
      </li>
      <li>
        The dot is off until you turn it on, and the choice is remembered in this browser. Messages that were already
        there when you turned it on do not count.
      </li>
    </ul>
  </article>
);

export default ChatHelp;
