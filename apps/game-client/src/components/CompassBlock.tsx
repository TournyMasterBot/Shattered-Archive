import React from 'react';
import styles from '../styles/CompassBlock.module.scss';
import { useCompassBlock, CompassDirection } from '../hooks/useCompassBlock';

export const CompassBlock: React.FC = () => {
  const { hasExit, move } = useCompassBlock();

  const btnClass = (dir: CompassDirection) =>
    [
      styles.compassBtn,
      hasExit(dir) ? styles.compassBtnAvailable : '',
      hasExit(dir) ? styles.compassBtnClickable : '',
    ].join(' ');

  const centerBtnClass = (dir: CompassDirection) =>
    [
      styles.compassCenterBtn,
      hasExit(dir) ? styles.compassBtnAvailable : '',
      hasExit(dir) ? styles.compassBtnClickable : '',
    ].join(' ');

  const handleClick = (dir: CompassDirection) => {
    if (!hasExit(dir)) return;
    move(dir);
  };

  return (
    <div className={styles.root}>
      <div className={styles.compassBlock}>
        <div className={styles.compassGrid}>
          <button className={btnClass('NW')} onClick={() => handleClick('NW')}>
            NW
          </button>
          <button className={btnClass('N')} onClick={() => handleClick('N')}>
            N
          </button>
          <button className={btnClass('NE')} onClick={() => handleClick('NE')}>
            NE
          </button>

          <button className={btnClass('W')} onClick={() => handleClick('W')}>
            W
          </button>

          <div className={styles.compassCenterUD}>
            <button className={centerBtnClass('U')} onClick={() => handleClick('U')}>
              U
            </button>
            <button className={centerBtnClass('D')} onClick={() => handleClick('D')}>
              D
            </button>
          </div>

          <button className={btnClass('E')} onClick={() => handleClick('E')}>
            E
          </button>

          <button className={btnClass('SW')} onClick={() => handleClick('SW')}>
            SW
          </button>
          <button className={btnClass('S')} onClick={() => handleClick('S')}>
            S
          </button>
          <button className={btnClass('SE')} onClick={() => handleClick('SE')}>
            SE
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompassBlock;
