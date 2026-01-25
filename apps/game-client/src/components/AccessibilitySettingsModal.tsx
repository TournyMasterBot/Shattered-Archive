// apps/game-client/src/components/AccessibilitySettingsModal.tsx
import React, { useEffect, useMemo, useState } from 'react';
import styles from '../styles/AccessibilitySettingsModal.module.scss';
import {
  getAccessibilitySettings,
  setAccessibilitySettings,
  type AccessibilitySettings,
} from '../features/accessibility/accessibility-settings-store';

// apply/remove high-contrast CSS via your existing CSS override pipeline
import { setHighContrastEnabled } from '../features/userStyles/userStyleOverrideStore';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';

type TabId = 'vision' | 'input' | 'about';

export interface AccessibilitySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function oneCharOr(v: string, fallback: string) {
  const s = (v ?? '').trim();
  if (!s) return fallback;
  return s.slice(0, 1);
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export const AccessibilitySettingsModal: React.FC<AccessibilitySettingsModalProps> = ({ isOpen, onClose }) => {
  const [active, setActive] = useState<TabId>('vision');
  const [draft, setDraft] = useState<AccessibilitySettings>(() => getAccessibilitySettings());

  useEffect(() => {
    if (!isOpen) return;
    setDraft(getAccessibilitySettings());
    setActive('vision');
  }, [isOpen]);

  const fontPct = useMemo(() => Math.round((draft.fontScale ?? 1) * 100), [draft.fontScale]);

  if (!isOpen) return null;

  const save = () => {
    const next: AccessibilitySettings = {
      ...draft,
      fontScale: clamp(Number(draft.fontScale ?? 1), 0.8, 1.6),

      clearStackKey: oneCharOr(draft.clearStackKey, '~'),
      clearStackCommand: oneCharOr(draft.clearStackCommand, '~'),

      commandSplitChar: oneCharOr(draft.commandSplitChar, ';'),
      repeaterPrefix: oneCharOr(draft.repeaterPrefix, '#'),
      repeatLastPrefix: oneCharOr(draft.repeatLastPrefix, '&'),
    };

    setAccessibilitySettings(next);

    // Apply high-contrast (adds/removes only the marked block; does not wipe user CSS)
    setHighContrastEnabled(!!next.preferHighContrast);

    // If preview was on, keep the visual consistent after save:
    // - preview injection can remain until modal closes; we clear on close below.
    DispatchEvent('shatteredarchive:accessibility-updated', {
      next,
    });

    onClose();
  };

  const closeWithoutSaving = () => {
    onClose();
  };

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Accessibility Settings">
        <div className={styles.header}>
          <div className={styles.title}>Accessibility</div>
          <button type="button" className={styles.closeButton} onClick={closeWithoutSaving} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.leftNav}>
            <button
              type="button"
              className={`${styles.navItem} ${active === 'vision' ? styles.navItemActive : ''}`}
              onClick={() => setActive('vision')}
            >
              Vision
            </button>

            <button
              type="button"
              className={`${styles.navItem} ${active === 'input' ? styles.navItemActive : ''}`}
              onClick={() => setActive('input')}
            >
              Command input
            </button>
          </div>

          <div className={styles.rightPane}>
            {active === 'vision' && (
              <div className={styles.section}>
                <div className={styles.field}>
                  <div className={styles.label}>Font scale</div>
                  <div className={styles.row}>
                    <input
                      className={styles.range}
                      type="range"
                      min={0.8}
                      max={1.6}
                      step={0.05}
                      value={draft.fontScale}
                      onChange={(e) => setDraft({ ...draft, fontScale: Number(e.target.value) })}
                    />
                    <div className={styles.valuePill}>{fontPct}%</div>
                  </div>
                </div>

                <label className={styles.row}>
                  <input
                    type="checkbox"
                    checked={draft.preferHighContrast}
                    onChange={(e) => setDraft({ ...draft, preferHighContrast: e.target.checked })}
                  />
                  <span>Prefer high contrast UI</span>
                </label>
              </div>
            )}

            {active === 'input' && (
              <div className={styles.section}>
                <label className={styles.row}>
                  <input
                    type="checkbox"
                    checked={draft.keepInputAfterSend}
                    onChange={(e) => setDraft({ ...draft, keepInputAfterSend: e.target.checked })}
                  />
                  <span>Keep command text in input after sending</span>
                </label>

                <div className={styles.divider} />

                <label className={styles.row}>
                  <input
                    type="checkbox"
                    checked={draft.enableLocalPrefixes}
                    onChange={(e) => setDraft({ ...draft, enableLocalPrefixes: e.target.checked })}
                  />
                  <span>Enable local prefix commands (intercept before sending to the server)</span>
                </label>

                <div className={styles.grid3}>
                  <label className={styles.smallField}>
                    Clear-stack key (typed)
                    <input
                      value={draft.clearStackKey}
                      onChange={(e) => setDraft({ ...draft, clearStackKey: e.target.value })}
                      disabled={!draft.enableLocalPrefixes}
                      spellCheck={false}
                    />
                    <div className={styles.hint}>Default: ~</div>
                  </label>

                  <label className={styles.smallField}>
                    Clear-stack command (sent)
                    <input
                      value={draft.clearStackCommand}
                      onChange={(e) => setDraft({ ...draft, clearStackCommand: e.target.value })}
                      disabled={!draft.enableLocalPrefixes}
                      spellCheck={false}
                    />
                    <div className={styles.hint}>Default: ~</div>
                  </label>

                  <label className={styles.smallField}>
                    Command split character
                    <input
                      value={draft.commandSplitChar}
                      onChange={(e) => setDraft({ ...draft, commandSplitChar: e.target.value })}
                      spellCheck={false}
                    />
                    <div className={styles.hint}>Default: ;</div>
                  </label>

                  <label className={styles.smallField}>
                    Speedwalk prefix
                    <input
                      value={draft.repeaterPrefix}
                      onChange={(e) => setDraft({ ...draft, repeaterPrefix: e.target.value })}
                      disabled={!draft.enableLocalPrefixes}
                      spellCheck={false}
                    />
                    <div className={styles.hint}>Default: #</div>
                  </label>

                  <label className={styles.smallField}>
                    Repeat-chain prefix
                    <input
                      value={draft.repeatLastPrefix}
                      onChange={(e) => setDraft({ ...draft, repeatLastPrefix: e.target.value })}
                      disabled={!draft.enableLocalPrefixes}
                      spellCheck={false}
                    />
                    <div className={styles.hint}>Default: &</div>
                  </label>
                </div>

                <div className={styles.hint}>
                  Examples:
                  <br />
                  <code>l;who;wave</code> → sends 3 commands
                  <br />
                  <code>~who</code> → sends <code>~</code> then <code>who</code>
                  <br />
                  <code>&10kill squirrel;where</code> → repeats the chain 10 times
                  <br />
                  <code>#5n;5e;5s</code> → n×5, e×5, s×5 in order
                </div>
              </div>
            )}

            {active === 'about' && (
              <div className={styles.section}>
                <div className={styles.hint}>
                  This modal stores preferences locally. Nothing is sent to the server unless you type a normal command.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={closeWithoutSaving}>
            Cancel
          </button>
          <button type="button" className={styles.saveButton} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessibilitySettingsModal;
