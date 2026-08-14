import { useState } from 'react';

import { roleParchmentCommands } from '../../domain/roleParchment.js';
import type { RoleDef } from '../../domain/types.js';

interface RoleParchmentModalProps {
  role: RoleDef;
  onClose: () => void;
}

export default function RoleParchmentModal({ role, onClose }: RoleParchmentModalProps) {
  const [copied, setCopied] = useState(false);
  const commands = roleParchmentCommands(role);

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
      <div
        className="ss-dialog"
        role="dialog"
        aria-label={`Role parchment commands for ${role.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ss-dialog-header">
          <h2>{role.name} role parchment</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="ss-parchment-hint">
          Hand these commands to a player assigned this role, one line at a time, to write an in-game parchment
          revealing it.
        </p>

        <textarea
          className="ss-parchment-commands"
          readOnly
          value={commands}
          rows={commands.split('\n').length + 1}
          aria-label="Role parchment commands"
          onFocus={(e) => e.currentTarget.select()}
        />

        <button type="button" onClick={copy}>
          {copied ? 'Copied!' : 'Copy commands'}
        </button>
      </div>
    </div>
  );
}
