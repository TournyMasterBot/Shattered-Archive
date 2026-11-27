// apps/game-client/src/components/simulacrumAdmin/ActivityTab.tsx
import React from 'react';
import styles from '../../styles/SimulacrumAdminWindow.module.scss';
import type { ActivityLog } from '../../features/simulacrumAdmin/activityLog';
import type { Verdict } from '../../features/simulacrumAdmin/verdict';

interface ActivityTabProps {
  activity: ActivityLog;
  /** False while another tab is showing: stays mounted (the filter survives) but draws nothing. */
  visible?: boolean;
  /** Tests give their own; the page uses the clipboard. */
  copyText?: (text: string) => Promise<void>;
}

const VERDICT_TEXT: Record<Verdict, string> = { accepted: 'Done', refused: 'Refused', unknown: 'Unknown' };

function clock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString([], { hour12: false });
}

const defaultCopy = (text: string): Promise<void> => navigator.clipboard.writeText(text);

const ActivityTab: React.FC<ActivityTabProps> = ({ activity, visible = true, copyText = defaultCopy }) => {
  const entries = React.useSyncExternalStore(activity.subscribe, activity.getEntries);
  const [verdict, setVerdict] = React.useState<'' | Verdict>('');
  const [copied, setCopied] = React.useState('');

  const shown = React.useMemo(
    () => (visible ? entries.filter((e) => verdict === '' || e.verdict === verdict).reverse() : []),
    [visible, entries, verdict],
  );

  const copy = (text: string): void => {
    copyText(text)
      .then(() => setCopied('Copied the raw reply.'))
      .catch(() => setCopied('Could not copy.'));
  };

  if (!visible) return null;
  return (
    <div className={styles.gmcp}>
      <div className={styles.toolbar}>
        <select className={styles.select} aria-label="Verdict" value={verdict} onChange={(e) => setVerdict(e.target.value as '' | Verdict)}>
          <option value="">All results</option>
          <option value="accepted">Done</option>
          <option value="refused">Refused</option>
          <option value="unknown">Unknown</option>
        </select>
        <span className={styles.spacer} />
        <button type="button" className={styles.smallButton} onClick={activity.clear} disabled={entries.length === 0}>
          Clear
        </button>
      </div>
      <p className={styles.counts} role="status">
        {entries.length === 0
          ? 'Nothing sent yet. Commands you run from this window appear here with the game’s answer.'
          : `${shown.length} of ${entries.length} shown, newest first. Kept in memory only; cleared when you leave the simulacrum.`}
        {copied !== '' && ` ${copied}`}
      </p>
      <ul className={styles.activityList} aria-label="Sent commands">
        {shown.map((entry) => (
          <li key={entry.id} className={styles.activityItem} data-verdict={entry.verdict}>
            <div className={styles.toolbar}>
              <span className={styles.time}>{clock(entry.at)}</span>
              <span className={styles.verdictBadge} data-verdict={entry.verdict}>
                {VERDICT_TEXT[entry.verdict]}
              </span>
              <code className={styles.sentLine}>{entry.line}</code>
              <span className={styles.spacer} />
              <button type="button" className={styles.smallButton} onClick={() => copy(entry.rawReply)} aria-label={`Copy raw reply of ${entry.line}`}>
                Copy raw
              </button>
            </div>
            {entry.replyLines.length > 0 ? <pre className={styles.reply}>{entry.replyLines.join('\n')}</pre> : <p className={styles.size}>The game sent no text.</p>}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ActivityTab;
