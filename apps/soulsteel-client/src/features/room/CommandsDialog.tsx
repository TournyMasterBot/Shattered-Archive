import { useState } from 'react';

interface CommandsDialogProps {
  /** Visible dialog heading. */
  title: string;
  /** Accessible name for the dialog itself — may differ from `title` (existing callers keep
   * their own established aria-label wording). */
  dialogLabel: string;
  /** Accessible name (and `getByLabelText` target in tests) for the commands textarea. */
  textareaLabel: string;
  hint: string;
  commands: string;
  onClose: () => void;
}

/** Shared chrome for "here is a block of in-game commands to copy" dialogs — a readonly textarea
 * plus a copy-to-clipboard button with a brief confirmation, closable via backdrop click. Used by
 * `RoleParchmentModal` (one role's commands) and the Bags panel's compiled full-setup view. */
export default function CommandsDialog({ title, dialogLabel, textareaLabel, hint, commands, onClose }: CommandsDialogProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(commands);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (permissions, insecure context) — the text is still
      // selectable in the textarea below, so this is a convenience, not the only path.
    }
  };

  return (
    <div className="ss-dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="ss-dialog" role="dialog" aria-label={dialogLabel} onClick={(e) => e.stopPropagation()}>
        <div className="ss-dialog-header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="ss-parchment-hint">{hint}</p>

        <textarea
          className="ss-parchment-commands"
          readOnly
          value={commands}
          rows={commands.split('\n').length + 1}
          aria-label={textareaLabel}
          onFocus={(e) => e.currentTarget.select()}
        />

        <button type="button" onClick={copy}>
          {copied ? 'Copied!' : 'Copy commands'}
        </button>
      </div>
    </div>
  );
}
