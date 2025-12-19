// apps\game-client\src\components\BottomPane.tsx
import React from 'react';
import styles from '../styles/BottomPane.module.scss';
import { MiscPane } from './MiscPane';
import { ChatPane } from './ChatPane';
import CompassBlockMobile from './CompassBlockMobile';
import { useBottomPane } from '../hooks/useBottomPane';

export const BottomPane: React.FC = () => {
  const { activeTab, selectTab, enemy, clampedPct } = useBottomPane();

  return (
    <div id="bottom-pane-root" className={styles.root}>
      {/* Tab strip */}
      <div id="bottom-pane-tab-strip" className={styles.menuBar} role="tablist">
        {/* Compass tab — mobile only */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'compass'}
          className={`${styles.menuItem} ${styles.menuItemCompass} ${
            activeTab === 'compass' ? styles.menuItemActive : ''
          }`}
          onClick={() => selectTab('compass')}
        >
          Compass
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'chat'}
          className={`${styles.menuItem} ${activeTab === 'chat' ? styles.menuItemActive : ''}`}
          onClick={() => selectTab('chat')}
        >
          Chat
        </button>

        {/* Opponent tab — mobile only */}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'opponent'}
          className={`${styles.menuItem} ${styles.menuItemOpponent} ${
            activeTab === 'opponent' ? styles.menuItemActive : ''
          }`}
          onClick={() => selectTab('opponent')}
        >
          Opponent
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'damage'}
          className={`${styles.menuItem} ${activeTab === 'damage' ? styles.menuItemActive : ''}`}
          onClick={() => selectTab('damage')}
        >
          Damage
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'misc'}
          className={`${styles.menuItem} ${activeTab === 'misc' ? styles.menuItemActive : ''}`}
          onClick={() => selectTab('misc')}
        >
          Misc
        </button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {activeTab === 'compass' && <CompassBlockMobile />}

        {activeTab === 'chat' && <ChatPane />}

        {activeTab === 'opponent' &&
          (enemy.visible ? (
            <div className={styles.opponentBar}>
              <div className={styles.opponentHeader}>OPPONENT</div>
              <div className={styles.opponentTrack}>
                <div className={styles.opponentFill} style={{ width: `${clampedPct}%` }} />
              </div>
              <div className={styles.opponentMeta}>
                <span>{enemy.label}</span>
                <span>{enemy.statusText || `${clampedPct.toFixed(0)}%`}</span>
              </div>
            </div>
          ) : (
            <span className={styles.placeholderText}>No active opponent.</span>
          ))}

        {activeTab === 'damage' && <span className={styles.placeholderText}>Damage tab content…</span>}

        {activeTab === 'misc' && <MiscPane />}
      </div>
    </div>
  );
};

export default BottomPane;
