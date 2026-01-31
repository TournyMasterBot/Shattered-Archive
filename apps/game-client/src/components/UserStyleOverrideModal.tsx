import React from 'react';
import styles from '../styles/UserStylesOverrideModal.module.scss';

export interface UserStyleOverrideModalProps {
  isOpen: boolean;
  appliedCss: string;
  draftCss: string;
  onChangeDraft: (css: string) => void;
  onSave: (css: string) => void; // apply draft as active CSS
  onPreview: (css: string) => void; // apply draft temporarily (no save)
  onDiscardDraft: () => void; // discard draft and revert to applied
  onClose: () => void; // close without changing applied/draft
}

export const UserStyleOverrideModal: React.FC<UserStyleOverrideModalProps> = ({
  isOpen,
  appliedCss,
  draftCss,
  onChangeDraft,
  onSave,
  onPreview,
  onDiscardDraft,
  onClose,
}) => {
  if (!isOpen) return null;

  const draftRef = React.useRef(draftCss);

  React.useEffect(() => {
    draftRef.current = draftCss;
  }, [draftCss]);

  const hasUnsavedChanges = draftCss !== appliedCss;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Custom CSS overrides">
      <div className={styles.modal}>
        <header className={styles.header}>
          <h2 className={styles.title}>Custom CSS Overrides</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </header>

        <div className={styles.body}>
          <p className={styles.description}>
            Enter custom CSS to override styles anywhere in the client. These styles are injected at the top level and
            saved in your browser.
          </p>

          <p className={hasUnsavedChanges ? styles.statusDraft : styles.statusApplied}>
            {hasUnsavedChanges ? 'Draft not applied' : 'Currently applied'}
          </p>

          <textarea
            className={styles.textarea}
            value={draftCss}
            onChange={(e) => {
              const v = e.target.value;
              draftRef.current = v;
              onChangeDraft(v);
            }}
            placeholder={`/* Example:
/* Make all text neon green and bigger */
body * {
  color: #00ff66 !important;
  font-size: 18px !important;
}

/* Make all buttons bright yellow with black text */
button {
  background: #ffff00 !important;
  color: #000000 !important;
  border: 2px solid #ff00ff !important;
}

/* Put a thick border around the main app root container */
#root {
  border: 4px dashed #ff00ff !important;
}
*/`}
          />
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              onDiscardDraft();
              onClose();
            }}
            disabled={!hasUnsavedChanges}
          >
            Discard Draft
          </button>

          <div className={styles.footerSpacer} />

          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            Cancel
          </button>

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => onPreview(draftRef.current)}
            disabled={!hasUnsavedChanges}
          >
            Preview
          </button>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => onSave(draftRef.current)}
            disabled={!hasUnsavedChanges}
          >
            Save & Apply
          </button>
        </footer>
      </div>
    </div>
  );
};

export default UserStyleOverrideModal;
