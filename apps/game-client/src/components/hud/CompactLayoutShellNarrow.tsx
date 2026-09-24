import React from 'react';
import styles from '../../styles/hud/CompactLayoutShellNarrow.module.scss';
// Same reasoning as CompactLayoutShell.tsx's own import: a session that only
// ever renders the narrow shell (phone-width the whole time) must still get
// this theme's CSS bundled into ITS chunk — it can't rely on the desktop
// shell's chunk having loaded first.
import '../../styles/hud/themes/slateAmber.theme.scss';
import { useCharacterIdentity } from '../../hooks/useCharacterIdentity';
import { CompactVitalsRow } from './CompactVitalsRow';
import { CompactRoomRow } from './CompactRoomRow';
import { CompactWidgetSlot } from './CompactWidgetSlot';
import CommandInput from '../CommandInput';
import { ChatPane } from '../ChatPane';
import AffectsBlock from '../AffectsBlock';
import { getCharacterIcon } from '../../features/hudLayout/characterIcon';
import type { HudShellBaseProps } from './LayoutShellProps';

const FOOTER_LABEL = 'Slate & Amber';

type NarrowTab = 'chat' | 'affects';

/**
 * The 'slate-amber' theme's OWN narrow-viewport shell (features/hudLayout/
 * themeRegistry.ts's NarrowShellComponent for this theme) — mirrors classic
 * LayoutShell's narrow-width pattern (stack to one column, tab away
 * secondary content instead of showing two columns side by side — see
 * LayoutShell.module.scss's @media (max-width: 900px) block and BottomPane's
 * compass/chat tabs) rather than inventing a new responsive idiom.
 *
 * Reuses the SAME desktop-compact sub-components (CompactVitalsRow,
 * CompactRoomRow, CompactWidgetSlot) so the same `sa-hud-*` classes render
 * here too — the theme's existing CSS (styles/hud/themes/slateAmber.theme.scss)
 * needs no viewport-specific rules to apply to most of this. Unlike classic's
 * BottomPane, there's no separate Compass tab: compact's room row already
 * shows exits inline, so tabbing only needs to cover Chat vs. Affects, the
 * two things desktop compact shows side by side that a narrow column can't.
 */
export const CompactLayoutShellNarrow: React.FC<HudShellBaseProps> = ({
  isConnected,
  sendRaw,
  onOpenAutoLeveling,
  autoLevelMode,
  autoLevelRunState,
  onSightseeRescan,
  terminalSlotRef,
}) => {
  const { characterName, raceName, className } = useCharacterIdentity();
  const characterIcon = getCharacterIcon({ raceName, className });
  const [activeTab, setActiveTab] = React.useState<NarrowTab>('chat');

  return (
    <div className={`${styles.shell} sa-hud-shell`}>
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
      </div>

      <div className={styles.tabStrip} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'chat'}
          data-active={activeTab === 'chat'}
          className={`${styles.tabButton} sa-hud-narrow-tab`}
          onClick={() => setActiveTab('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'affects'}
          data-active={activeTab === 'affects'}
          className={`${styles.tabButton} sa-hud-narrow-tab`}
          onClick={() => setActiveTab('affects')}
        >
          Affects
        </button>
      </div>

      <div className={styles.tabContent}>
        {activeTab === 'chat' && (
          <div className={`${styles.chatPane} sa-hud-chat-pane`}>
            <ChatPane />
          </div>
        )}

        {activeTab === 'affects' && (
          <div className={styles.affectsAndSlot}>
            <div className={`${styles.affectsPanel} sa-hud-affects-panel`}>
              <AffectsBlock />
            </div>
            <CompactWidgetSlot slotId="hud.rightColumn" />
          </div>
        )}
      </div>

      <div className={`${styles.footerRow} sa-hud-footer-row`}>{FOOTER_LABEL}</div>
    </div>
  );
};

export default CompactLayoutShellNarrow;
