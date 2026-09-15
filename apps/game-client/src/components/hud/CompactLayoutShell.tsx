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
import { getHudLayout, type HudLayoutMode } from '../../features/hudLayout/hudLayoutStore';
import { getHudTheme, type HudTheme } from '../../features/hudLayout/hudThemeStore';
import { getCharacterIcon } from '../../features/hudLayout/characterIcon';

const HUD_LAYOUT_LABELS: Record<HudLayoutMode, string> = {
  classic: 'Classic',
  compact: 'Compact',
};

const HUD_THEME_LABELS: Record<HudTheme, string> = {
  default: 'Default',
  'slate-amber': 'Slate & Amber',
};

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
  const { layoutVars, handleVerticalResizeMouseDown, handleChatResizeMouseDown, chatPaneRef } = useCompactLayoutSizing();
  const { characterName, raceName, className } = useCharacterIdentity();
  const characterIcon = getCharacterIcon({ raceName, className });
  const [footerLabel] = React.useState(
    () => `${HUD_LAYOUT_LABELS[getHudLayout()]} · ${HUD_THEME_LABELS[getHudTheme()]}`,
  );

  return (
    <div className={`${styles.shell} sa-hud-shell`} style={layoutVars}>
      <div className={styles.leftColumn}>
        <div className={`${styles.terminalPanel} sa-hud-terminal-panel`}>
          {characterName && (
            <span className={`${styles.borderedPanelTitle} sa-hud-terminal-title`}>
              {characterIcon ? `${characterIcon} ${characterName}` : characterName}
            </span>
          )}
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
          <div className={`${styles.footerRow} sa-hud-footer-row`}>{footerLabel}</div>
        </div>
      </div>

      <div className={styles.verticalResizer} onMouseDown={handleVerticalResizeMouseDown} />

      <div className={`${styles.rightColumn} sa-hud-right-column`}>
        <div ref={chatPaneRef} className={`${styles.chatPane} sa-hud-chat-pane`}>
          <ChatPane />
        </div>

        <div className={styles.chatResizer} onMouseDown={handleChatResizeMouseDown} />

        <div className={styles.affectsAndSlot}>
          <div className={`${styles.affectsPanel} sa-hud-affects-panel`}>
            <AffectsBlock />
          </div>
          <CompactWidgetSlot slotId="hud.rightColumn" />
        </div>
      </div>
    </div>
  );
};

export default CompactLayoutShell;
