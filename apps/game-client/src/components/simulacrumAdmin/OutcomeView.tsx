// apps/game-client/src/components/simulacrumAdmin/OutcomeView.tsx
import React from 'react';
import styles from '../../styles/SimulacrumAdminWindow.module.scss';
import { describeOutcome } from '../../features/simulacrumAdmin/outcomeText';
import type { RunOutcome } from '../../features/simulacrumAdmin/sender';

/** What the game answered to a run, in the game's words (shared by the Commands and Players tabs). */
const OutcomeView: React.FC<{ outcome: RunOutcome }> = ({ outcome }) => {
  const shown = describeOutcome(outcome);
  return (
    <div className={styles.result} data-tone={shown.tone} role="status">
      <strong>{shown.text}</strong>
      {shown.lines.length > 0 && <pre className={styles.reply}>{shown.lines.join('\n')}</pre>}
      {shown.tone !== 'info' && shown.lines.length === 0 && <p className={styles.size}>The game sent no text.</p>}
    </div>
  );
};

export default OutcomeView;
