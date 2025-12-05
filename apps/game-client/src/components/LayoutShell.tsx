import React, { CSSProperties } from 'react';
import styles from '../styles/MainContainer.module.scss';

interface LayoutShellProps {
  layoutVars: CSSProperties;
  onVerticalResizeMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onHorizontalResizeMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  BottomPaneComponent: React.ComponentType;
}

/**
 * Main split layout that hosts:
 * - Play area (top-left)
 * - Bottom pane (bottom-left)
 * - Right pane (sidebar)
 * plus the resizable splitters between them.
 */
export const LayoutShell: React.FC<LayoutShellProps> = ({
  layoutVars,
  onVerticalResizeMouseDown,
  onHorizontalResizeMouseDown,
  BottomPaneComponent,
}) => {
  return (
    <div className={styles.layoutShell} style={layoutVars}>
      <div className={styles.mainSplit}>
        <div className={styles.leftColumn}>
          <div className={styles.playArea}>
            <span className={styles.placeholderText}>Play Area</span>
          </div>

          <div className={styles.horizontalResizer} onMouseDown={onHorizontalResizeMouseDown} />

          <div className={styles.bottomPane}>
            <BottomPaneComponent />
          </div>
        </div>

        <div className={styles.verticalResizer} onMouseDown={onVerticalResizeMouseDown} />

        <aside className={styles.rightPane}>
          <span className={styles.placeholderText}>Right Pane</span>
        </aside>
      </div>
    </div>
  );
};
