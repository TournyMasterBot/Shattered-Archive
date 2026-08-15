import { useState } from 'react';

export interface ScriptVariant {
  language: string;
  label: string;
  source: string;
}

interface UserScriptDialogProps {
  title: string;
  dialogLabel: string;
  hint: string;
  variants: ScriptVariant[];
  onClose: () => void;
}

/** Like `CommandsDialog`, but for showing the same content across several script languages at
 * once, switched via a row of tab buttons — used for the Bags panel's userscript template and
 * populated alias script views. */
export default function UserScriptDialog({ title, dialogLabel, hint, variants, onClose }: UserScriptDialogProps) {
  const [activeLanguage, setActiveLanguage] = useState(variants[0]?.language ?? '');
  const [copied, setCopied] = useState(false);
  const active = variants.find((v) => v.language === activeLanguage) ?? variants[0];

  const copy = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.source);
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

        <div className="ss-script-lang-tabs" role="tablist" aria-label="Script language">
          {variants.map((v) => (
            <button
              key={v.language}
              type="button"
              role="tab"
              aria-selected={v.language === activeLanguage}
              className={v.language === activeLanguage ? 'ss-active' : ''}
              onClick={() => {
                setActiveLanguage(v.language);
                setCopied(false);
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {active && (
          <textarea
            key={active.language}
            className="ss-parchment-commands"
            readOnly
            value={active.source}
            rows={active.source.split('\n').length + 1}
            aria-label={`${active.label} source`}
            onFocus={(e) => e.currentTarget.select()}
          />
        )}

        <button type="button" onClick={copy}>
          {copied ? 'Copied!' : 'Copy commands'}
        </button>
      </div>
    </div>
  );
}
