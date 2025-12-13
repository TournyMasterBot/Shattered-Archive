import React from 'react';
import styles from '../styles/CompassBlock.module.scss';
import { useCompassBlock, CompassDirection } from '../hooks/useCompassBlock';

const ORDER: CompassDirection[] = ['NW', 'N', 'NE', 'W', 'E', 'SW', 'S', 'SE', 'U', 'D'];

export const CompassBlockMobile: React.FC = () => {
  const { hasExit } = useCompassBlock();

  const cls = (dir: CompassDirection) => `${styles.mobileWideBtn} ${hasExit(dir) ? styles.mobileWideBtnAvailable : ''}`;

  return (
    <div className={styles.mobileWide}>
      {ORDER.map((dir) => (
        <button key={dir} className={cls(dir)}>
          {dir}
        </button>
      ))}
    </div>
  );
};

export default CompassBlockMobile;
