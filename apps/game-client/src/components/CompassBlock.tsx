import React from 'react';
import styles from '../styles/CompassBlock.module.scss';
import { useCompassBlock, CompassDirection } from '../hooks/useCompassBlock';

export const CompassBlock: React.FC = () => {
  const { hasExit } = useCompassBlock();

  const btnClass = (dir: CompassDirection) => `${styles.compassBtn} ${hasExit(dir) ? styles.compassBtnAvailable : ''}`;

  const centerBtnClass = (dir: CompassDirection) =>
    `${styles.compassCenterBtn} ${hasExit(dir) ? styles.compassBtnAvailable : ''}`;

  return (
    <div className={styles.root}>
      <div className={styles.compassBlock}>
        <div className={styles.compassGrid}>
          <button className={btnClass('NW')}>NW</button>
          <button className={btnClass('N')}>N</button>
          <button className={btnClass('NE')}>NE</button>

          <button className={btnClass('W')}>W</button>

          <div className={styles.compassCenterUD}>
            <button className={centerBtnClass('U')}>U</button>
            <button className={centerBtnClass('D')}>D</button>
          </div>

          <button className={btnClass('E')}>E</button>

          <button className={btnClass('SW')}>SW</button>
          <button className={btnClass('S')}>S</button>
          <button className={btnClass('SE')}>SE</button>
        </div>
      </div>
    </div>
  );
};

export default CompassBlock;
