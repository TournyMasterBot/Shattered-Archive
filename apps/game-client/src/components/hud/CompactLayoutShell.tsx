import React from 'react';
import styles from '../../styles/hud/CompactLayoutShell.module.scss';
import { useCompactLayoutSizing } from '../../hooks/useCompactLayoutSizing';
import { useCharacterIdentity } from '../../hooks/useCharacterIdentity';
import { CompactVitalsRow } from './CompactVitalsRow';
import { CompactRoomRow } from './CompactRoomRow';
import { CompactWidgetSlot } from './CompactWidgetSlot';
import Terminal from '../Terminal';
import CommandInput from '../CommandInput';
import { ChatPane } from '../ChatPane';
import AffectsBlock from '../AffectsBlock';
import { AutoLevelMode, AutoLevelRunState } from '../../features/autoleveling/autoleveling-types';

export interface CompactLayoutShellProps {
  isConnected: boolean;
  sendRaw: (data: string) => void;
  onOpenAutoLeveling?: () => void;
  autoLevelMode?: AutoLevelMode;
  autoLevelRunState?: AutoLevelRunState;
  onSightseeRescan?: () => void;
}

export const CompactLayoutShell: React.FC<CompactLayoutShellProps> = ({
  isConnected,
  sendRaw,
  onOpenAutoLeveling,
  autoLevelMode,
  autoLevelRunState,
  onSightseeRescan,
}) => {
  const { layoutVars, handleVerticalResizeMouseDown, handleChatResizeMouseDown } = useCompactLayoutSizing();
  const { characterName } = useCharacterIdentity();

  return (
    <div className={`${styles.shell} sa-hud-shell`} style={layoutVars}>
      <div className={styles.leftColumn}>
        <div className={`${styles.terminalPanel} sa-hud-terminal-panel`}>
          {characterName && <span className={`${styles.borderedPanelTitle} sa-hud-terminal-title`}>{characterName}</span>}
          <div className={styles.terminalBody}>
            <Terminal />
          </div>
        </div>

        <div className={`${styles.subWindow} sa-hud-sub-window`}>
          <CompactVitalsRow />
          <CompactRoomRow />
          <CompactWidgetSlot slotId="hud.bottomStrip" />
          <CommandInput
            isConnected={isConnected}
            sendRaw={sendRaw}
            onOpenAutoLeveling={onOpenAutoLeveling}
            autoLevelMode={autoLevelMode}
            autoLevelRunState={autoLevelRunState}
            onSightseeRescan={onSightseeRescan}
          />
        </div>
      </div>

      <div className={styles.verticalResizer} onMouseDown={handleVerticalResizeMouseDown} />

      <div className={`${styles.rightColumn} sa-hud-right-column`}>
        <div className={`${styles.chatPane} sa-hud-chat-pane`}>
          <ChatPane />
        </div>

        <div className={styles.chatResizer} onMouseDown={handleChatResizeMouseDown} />

        <div className={styles.affectsAndSlot}>
          <div className="sa-hud-affects-panel">
            <AffectsBlock />
          </div>
          <CompactWidgetSlot slotId="hud.rightColumn" />
        </div>
      </div>
    </div>
  );
};

export default CompactLayoutShell;
