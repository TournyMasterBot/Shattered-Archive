// apps/game-client/src/components/AudioSettingsModal.tsx
import React, { useEffect, useState } from 'react';
import styles from '../styles/AudioSettingsModal.module.scss';

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AudioSection = 'master' | 'music' | 'sfx';

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState<AudioSection>('master');

  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  });

  useEffect(() => {
    const onResize = () => {
      setIsSmallScreen(window.innerWidth <= 768);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.title}>Audio Settings</div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Left nav */}
          <div className={styles.navPane}>
            <button
              className={`${styles.navItem} ${activeSection === 'master' ? styles.navItemActive : ''}`}
              onClick={() => setActiveSection('master')}
            >
              Master
            </button>

            <button
              className={`${styles.navItem} ${activeSection === 'music' ? styles.navItemActive : ''}`}
              onClick={() => setActiveSection('music')}
            >
              Music
            </button>

            <button
              className={`${styles.navItem} ${activeSection === 'sfx' ? styles.navItemActive : ''}`}
              onClick={() => setActiveSection('sfx')}
            >
              SFX
            </button>
          </div>

          {/* Right pane */}
          <div className={styles.contentPane}>
            {activeSection === 'master' && (
              <div className={styles.section}>
                <h3>Master Volume</h3>
                <p className={styles.hint}>Controls overall game volume.</p>

                <label className={styles.sliderRow}>
                  <span>Volume</span>
                  <input type="range" min={0} max={100} step={1} defaultValue={100} />
                </label>
              </div>
            )}

            {activeSection === 'music' && (
              <div className={styles.section}>
                <h3>Music</h3>
                <p className={styles.hint}>Background music and ambience.</p>

                <label className={styles.sliderRow}>
                  <span>Volume</span>
                  <input type="range" min={0} max={100} step={1} defaultValue={70} />
                </label>

                <label className={styles.checkboxRow}>
                  <input type="checkbox" defaultChecked />
                  Enable music
                </label>
              </div>
            )}

            {activeSection === 'sfx' && (
              <div className={styles.section}>
                <h3>Sound Effects</h3>
                <p className={styles.hint}>Combat, UI, and feedback sounds.</p>

                <label className={styles.sliderRow}>
                  <span>Volume</span>
                  <input type="range" min={0} max={100} step={1} defaultValue={85} />
                </label>

                <label className={styles.checkboxRow}>
                  <input type="checkbox" defaultChecked />
                  Enable sound effects
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioSettingsModal;
