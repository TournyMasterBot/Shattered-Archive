import React from 'react';
import styles from '../styles/MainContainer.module.scss';

interface FocusBarProps {
  label?: string;
}

/**
 * Narrow focus bar shown only on small screens.
 * The actual visibility is controlled via CSS media queries.
 */
export const FocusBar: React.FC<FocusBarProps> = ({ label = 'Focused details go here…' }) => {
  return (
    <div className={styles.focusBar}>
      <div className={styles.focusBarContent}>
        <span className={styles.focusBarLabel}>{label}</span>
      </div>
    </div>
  );
};
