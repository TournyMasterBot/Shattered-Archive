import React, { useEffect, useMemo, useState } from 'react';
import styles from '../styles/GraphicsSettingsModal.module.scss';

export interface GraphicsSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type GraphicsNavKey = 'rendering';

type GraphicsConfig = {
  // Rendering
  preferWebGL: boolean;
  enableEffects: boolean;

  // Text / terminal
  fontSize: number;
  lineHeight: number;

  // Perf
  reduceMotion: boolean;
};

const STORAGE_KEY = 'shatteredArchive.graphics.config.v1';

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function loadConfig(): GraphicsConfig {
  const defaults: GraphicsConfig = {
    preferWebGL: true,
    enableEffects: true,
    fontSize: 12,
    lineHeight: 18,
    reduceMotion: false,
  };

  if (typeof window === 'undefined') return defaults;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<GraphicsConfig>;

    return {
      ...defaults,
      ...parsed,
      fontSize: clamp(Number(parsed.fontSize ?? defaults.fontSize), 8, 32),
      lineHeight: clamp(Number(parsed.lineHeight ?? defaults.lineHeight), 10, 60),
    };
  } catch {
    return defaults;
  }
}

function saveConfig(cfg: GraphicsConfig) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

export const GraphicsSettingsModal: React.FC<GraphicsSettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeNav, setActiveNav] = useState<GraphicsNavKey>('rendering');

  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  });

  const [config, setConfig] = useState<GraphicsConfig>(() => loadConfig());
  const [draft, setDraft] = useState<GraphicsConfig>(() => loadConfig());

  // Track viewport size (same pattern as your ScriptSandbox)
  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      setIsSmallScreen(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset draft on open/close
  useEffect(() => {
    if (isOpen) {
      const current = loadConfig();
      setConfig(current);
      setDraft(current);
      setActiveNav('rendering');
    }
  }, [isOpen]);

  const hasDraftChanges = useMemo(() => {
    return JSON.stringify(config) !== JSON.stringify(draft);
  }, [config, draft]);

  if (!isOpen) return null;

  const handleSave = () => {
    // normalize a couple values
    const next: GraphicsConfig = {
      ...draft,
      fontSize: clamp(draft.fontSize, 8, 32),
      lineHeight: clamp(draft.lineHeight, 10, 60),
    };

    saveConfig(next);
    setConfig(next);
    setDraft(next);

    // Optional: broadcast so other parts of the app can react without prop plumbing.
    // (No one has to listen yet.)
    try {
      window.dispatchEvent(new CustomEvent('game:graphics-config-changed', { detail: next }));
    } catch {
      // ignore
    }
  };

  const handleDiscard = () => {
    setDraft(config);
  };

  const handleResetDefaults = () => {
    const defaults = loadConfig(); // loadConfig() returns defaults if nothing stored; but we want hard defaults
    // If you want a truly "factory reset", clear storage first:
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    const fresh = loadConfig();
    setConfig(fresh);
    setDraft(fresh);

    try {
      window.dispatchEvent(new CustomEvent('game:graphics-config-changed', { detail: fresh }));
    } catch {
      // ignore
    }
  };

  const navItems: Array<{ key: GraphicsNavKey; label: string; hint?: string }> = [
    { key: 'rendering', label: 'Rendering', hint: 'Effects & engine' },
  ];

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.title}>Graphics</div>
          <div className={styles.headerRight}>
            <button type="button" className={styles.secondaryButton} onClick={handleResetDefaults}>
              Reset
            </button>
            <button type="button" className={styles.closeButton} onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Left nav */}
          <div className={styles.navPane}>
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`${styles.navItem} ${activeNav === item.key ? styles.navItemActive : ''}`}
                onClick={() => setActiveNav(item.key)}
              >
                <div className={styles.navLabel}>{item.label}</div>
                {item.hint && <div className={styles.navHint}>{item.hint}</div>}
              </button>
            ))}
          </div>

          {/* Right settings */}
          <div className={styles.settingsPane}>
            <div className={styles.paneHeader}>
              <div className={styles.paneTitle}>{activeNav === 'rendering' ? 'Rendering' : ''}</div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.discardButton}
                  onClick={handleDiscard}
                  disabled={!hasDraftChanges}
                >
                  Discard
                </button>
                <button type="button" className={styles.saveButton} onClick={handleSave} disabled={!hasDraftChanges}>
                  Save
                </button>
              </div>
            </div>

            {/* Sections */}
            {activeNav === 'rendering' && (
              <div className={styles.section}>
                <label className={styles.row}>
                  <span className={styles.rowLabel}>Prefer WebGL</span>
                  <input
                    type="checkbox"
                    checked={draft.preferWebGL}
                    onChange={(e) => setDraft((d) => ({ ...d, preferWebGL: e.target.checked }))}
                  />
                </label>

                <label className={styles.row}>
                  <span className={styles.rowLabel}>Enable effects</span>
                  <input
                    type="checkbox"
                    checked={draft.enableEffects}
                    onChange={(e) => setDraft((d) => ({ ...d, enableEffects: e.target.checked }))}
                  />
                </label>

                <div className={styles.section}>
                  <label className={styles.field}>
                    <div className={styles.fieldLabel}>Font size</div>
                    <input
                      type="number"
                      min={8}
                      max={32}
                      value={draft.fontSize}
                      onChange={(e) => setDraft((d) => ({ ...d, fontSize: Number(e.target.value) }))}
                    />
                  </label>

                  <label className={styles.field}>
                    <div className={styles.fieldLabel}>Line height</div>
                    <input
                      type="number"
                      min={10}
                      max={60}
                      value={draft.lineHeight}
                      onChange={(e) => setDraft((d) => ({ ...d, lineHeight: Number(e.target.value) }))}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Small-screen note (optional) */}
        {isSmallScreen && (
          <div className={styles.mobileFooterHint}>Tip: swipe/scroll the settings pane if it’s long.</div>
        )}
      </div>
    </div>
  );
};

export default GraphicsSettingsModal;
