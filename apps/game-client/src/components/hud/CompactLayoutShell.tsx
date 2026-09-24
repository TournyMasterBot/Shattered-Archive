import React from 'react';
import styles from '../../styles/hud/CompactLayoutShell.module.scss';
// Side-effect import: this theme's rules are gated behind
// :root[data-hud-theme='slate-amber'] (set by themeRegistry.ts's loadStyles),
// so bundling it here has no visual effect unless this shell is actually the
// active theme — but it DOES tie the CSS to the same lazy-loaded chunk as
// this component, matching Step 2's code-splitting for everything else.
import '../../styles/hud/themes/slateAmber.theme.scss';
import { useCompactLayoutSizing } from '../../hooks/useCompactLayoutSizing';
import { useCharacterIdentity } from '../../hooks/useCharacterIdentity';
import { CompactVitalsRow } from './CompactVitalsRow';
import { CompactRoomRow } from './CompactRoomRow';
import { CompactWidgetSlot } from './CompactWidgetSlot';
import CommandInput from '../CommandInput';
import { ChatPane } from '../ChatPane';
import AffectsBlock from '../AffectsBlock';
import { getCharacterIcon } from '../../features/hudLayout/characterIcon';
import type { HudShellBaseProps } from './LayoutShellProps';

// This shell IS the slate-amber theme's shell — it never represents any
// other theme, so its label is a fixed constant, not a lookup. The registry
// (features/hudLayout/themeRegistry.ts) is the single source of truth for
// which theme is active; this component doesn't need to know.
const FOOTER_LABEL = 'Slate & Amber';

export type CompactLayoutShellProps = HudShellBaseProps;

export const CompactLayoutShell: React.FC<CompactLayoutShellProps> = ({
  isConnected,
  sendRaw,
  onOpenAutoLeveling,
  autoLevelMode,
  autoLevelRunState,
  onSightseeRescan,
  terminalSlotRef,
}) => {
  const { layoutVars, handleVerticalResizeMouseDown, handleChatResizeMouseDown, chatPaneRef } = useCompactLayoutSizing();
  const { characterName, raceName, className } = useCharacterIdentity();
  const characterIcon = getCharacterIcon({ raceName, className });

  return (
    <div className={`${styles.shell} sa-hud-shell`} style={layoutVars}>
      <div className={styles.leftColumn}>
        <div className={`${styles.terminalPanel} sa-hud-terminal-panel`}>
          {characterName && (
            <span className={`${styles.borderedPanelTitle} sa-hud-terminal-title`}>
              {characterIcon ? `${characterIcon} ${characterName}` : characterName}
            </span>
          )}
          <div className={styles.terminalBody} ref={terminalSlotRef} />
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
          <div className={`${styles.footerRow} sa-hud-footer-row`}>{FOOTER_LABEL}</div>
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
