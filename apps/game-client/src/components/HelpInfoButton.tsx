// apps/game-client/src/components/HelpInfoButton.tsx
//
// The blue (i): the small round indicator a window carries in its header to open its help. It is a toggle (the help replaces the window's body
// while it is on; pressing it again, or the Back button of the help, returns), so it reports aria-pressed. One look for every window.
import React from 'react';
import styles from '../styles/HelpInfo.module.scss';

export interface HelpInfoButtonProps {
  /** What the help is about, for the accessible name: "Copilot" gives "Help: Copilot". */
  topic: string;
  open: boolean;
  onToggle: () => void;
}

const HelpInfoButton: React.FC<HelpInfoButtonProps> = ({ topic, open, onToggle }) => (
  <button
    type="button"
    className={styles.info}
    aria-label={`Help: ${topic}`}
    aria-pressed={open}
    title={open ? 'Close the help' : `Help: ${topic}`}
    onClick={onToggle}
    // the header is a drag handle: a press on the indicator must not start a drag
    onPointerDown={(event) => event.stopPropagation()}
  >
    i
  </button>
);

export default HelpInfoButton;
