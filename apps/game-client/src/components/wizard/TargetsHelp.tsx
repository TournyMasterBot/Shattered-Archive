// apps/game-client/src/components/wizard/TargetsHelp.tsx
//
// Help for the Autopilot wizard's Targets step: what pre-loaded and your own targets are, how to correct one, and how the
// corrections follow you between devices. It replaces the step's body while the blue (i) is on (same pattern as MapHelp).
import React from 'react';
import styles from '../../styles/HelpInfo.module.scss';

export interface TargetsHelpProps {
  onBack: () => void;
}

const TargetsHelp: React.FC<TargetsHelpProps> = ({ onBack }) => (
  <article className={styles.help} aria-label="Targets help">
    <button type="button" className={styles.helpBack} onClick={onBack}>
      ← Back to the targets
    </button>
    <h3>About targets</h3>
    <p>
      Autopilot fights the creatures on this list, and only those. Each one is matched by the line you see when you walk into a room
      (for example <em>An enlarged squirrel scurries about here.</em>) and attacked with <code>kill</code> and its keyword.
    </p>

    <h4>Pre-loaded and your own</h4>
    <ul>
      <li>
        <strong>Pre-loaded</strong> targets come with the area. If a line or keyword is wrong, or a creature is missing from the list,
        autopilot walks past it.
      </li>
      <li>
        <strong>Your targets</strong> are ones you add yourself with the boxes at the bottom: the line you see, and the keyword that
        works after <code>kill</code>.
      </li>
    </ul>

    <h4>Correcting a pre-loaded target</h4>
    <ul>
      <li>
        <strong>Edit</strong> changes its line or keyword. The change is yours alone: the shared list is untouched, and anything you
        did not change keeps following the shared list.
      </li>
      <li>
        <strong>Hide</strong> takes a target out of your list. It waits under <em>Hidden by you</em> and <strong>Restore</strong> puts it
        back.
      </li>
      <li>
        <strong>Reset to default</strong> throws your change away and brings back the shared line and keyword.
      </li>
      <li>
        If the shared list later drops or renames a target you edited, your edit is kept under <em>Edits that no longer match this
        area</em> until you delete it.
      </li>
    </ul>

    <h4>Rules for the text</h4>
    <ul>
      <li>A line or keyword needs at least one character and at most 200.</li>
      <li>
        It cannot contain <code>;</code> or a line break, because they would send extra commands. Two targets cannot share the same line.
      </li>
    </ul>

    <h4>On your other devices</h4>
    <p>
      Your edits, hidden targets and own targets are saved in this browser. To use them elsewhere, log in and press{' '}
      <strong>Save to cloud</strong> in your account window, then <strong>Load from cloud</strong> on the other device.
    </p>
  </article>
);

export default TargetsHelp;
