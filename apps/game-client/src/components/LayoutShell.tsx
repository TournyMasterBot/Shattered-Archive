// apps/game-client/src/components/LayoutShell.tsx
import React from 'react';
import styles from '../styles/LayoutShell.module.scss';

import Terminal from './Terminal';
import CommandInput from './CommandInput';
import RightSidebar from './RightSidebar';
import { AutoLevelMode, AutoLevelRunState } from '../features/autoleveling/autoleveling-types';

interface LayoutShellProps {
  layoutVars: React.CSSProperties;
  onVerticalResizeMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onHorizontalResizeMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  BottomPaneComponent: React.ComponentType;

  // From useGameConnection
  isConnected: boolean;
  sendRaw: (data: string) => void;

  onOpenAutoLeveling?: () => void;
  autoLevelMode?: AutoLevelMode;
  autoLevelRunState?: AutoLevelRunState;
  onSightseeRescan?: () => void;
}

export const LayoutShell: React.FC<LayoutShellProps> = ({
  layoutVars,
  onVerticalResizeMouseDown,
  onHorizontalResizeMouseDown,
  BottomPaneComponent,
  isConnected,
  sendRaw,
  onOpenAutoLeveling,
  autoLevelMode,
  autoLevelRunState,
  onSightseeRescan,
}) => {
  return (
    <div className={styles.layoutShell} style={layoutVars}>
      <div className={styles.mainSplit}>
        {/* LEFT COLUMN (Play Area + Bottom Pane) */}
        <div className={styles.leftColumn}>
          <div className={styles.playArea}>
            <div className={styles.playAreaTerminalShell}>
              <Terminal />
            </div>

            {/* Command input bar at the bottom of the play area */}
            <CommandInput
              isConnected={isConnected}
              sendRaw={sendRaw}
              onOpenAutoLeveling={onOpenAutoLeveling}
              autoLevelMode={autoLevelMode}
              autoLevelRunState={autoLevelRunState}
              onSightseeRescan={onSightseeRescan}
            />
          </div>

          <div className={styles.horizontalResizer} onMouseDown={onHorizontalResizeMouseDown} />

          <div className={styles.bottomPane}>
            <BottomPaneComponent />
          </div>
        </div>

        {/* VERTICAL SPLITTER */}
        <div className={styles.verticalResizer} onMouseDown={onVerticalResizeMouseDown} />

        {/* RIGHT SIDEBAR */}
        <RightSidebar />
      </div>
    </div>
  );
};

export default LayoutShell;
