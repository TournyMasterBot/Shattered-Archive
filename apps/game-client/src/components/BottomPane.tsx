import React, { useState } from 'react';
import styles from '../styles/BottomPane.module.scss';

type BottomTab = 'exploration' | 'chat' | 'settings';

export const BottomPane: React.FC = () => {
  const [activeTab, setActiveTab] = useState<BottomTab>('exploration');

  return (
    <div className={styles.root}>
      {/* Tab strip */}
      <div className={styles.menuBar} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'exploration'}
          className={`${styles.menuItem} ${activeTab === 'exploration' ? styles.menuItemActive : ''}`}
          onClick={() => setActiveTab('exploration')}
        >
          Exploration
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'chat'}
          className={`${styles.menuItem} ${activeTab === 'chat' ? styles.menuItemActive : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          Chat
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'settings'}
          className={`${styles.menuItem} ${activeTab === 'settings' ? styles.menuItemActive : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      {/* Content area fills remaining space */}
      <div className={styles.content}>
        {activeTab === 'exploration' && <span className={styles.placeholderText}>Exploration tab content…</span>}
        {activeTab === 'chat' && <span className={styles.placeholderText}>Chat tab content…</span>}
        {activeTab === 'settings' && <span className={styles.placeholderText}>Settings tab content…</span>}
      </div>
    </div>
  );
};

export default BottomPane;
