// apps/game-client/src/components/wizard/CombatHelp.tsx
//
// Help for the Autopilot wizard's Combat step: the class list, what is filled in for you and when, and what you keep. It
// replaces the step's body while the blue (i) is on (same pattern as MapHelp and TargetsHelp).
import React from 'react';
import styles from '../../styles/HelpInfo.module.scss';

export interface CombatHelpProps {
  onBack: () => void;
}

const CombatHelp: React.FC<CombatHelpProps> = ({ onBack }) => (
  <article className={styles.help} aria-label="Combat help">
    <button type="button" className={styles.helpBack} onClick={onBack}>
      ← Back to combat
    </button>
    <h3>About combat setup</h3>

    <h4>Your class</h4>
    <p>
      The list holds every playable class: the base classes first, then the reclasses. Your pick is remembered. If the list cannot be
      loaded you see only the five base classes and a notice; reopen the wizard once you are connected.
    </p>

    <h4>What is filled in for you</h4>
    <ul>
      <li>
        <strong>Buffs</strong>: the protective and damage buffs your class really has at your level, such as Sanctuary, Armor, Shield,
        Stone Skin, Bless, Frenzy, Haste, Giant Strength and Berserk, with the command and the affect autopilot watches for.
      </li>
      <li>
        <strong>Fight commands</strong>: up to three attacks your class has at your level, the strongest spells first and then the
        usual combat skills. The reuse time starts at 0 unless autopilot has already learned one for that attack.
      </li>
      <li>
        Detections, travel spells and alignment protections are not added for you; add them with <em>Add from catalog</em> or the
        ability list.
      </li>
    </ul>

    <h4>Buffs you do not have yet</h4>
    <p>
      A buff your class only gets at a higher level is still listed, <em>paused</em> and with a warning, because you can apply it another
      way meanwhile: quaff a potion, or use a wand or staff. Change its command to that (for example <code>quaff haste</code>), then
      press <strong>resume</strong>; the warning goes away once the command is no longer the spell. A paused buff is never cast.
    </p>

    <h4>Pausing a fight command</h4>
    <p>
      <strong>Pause</strong> on a fight command makes autopilot skip it without removing it, for example while you have not practiced the
      skill yet. The row keeps its reuse time, gates and place in the list, shows a <em>paused</em> tag, and <strong>Resume</strong> turns
      it back on. If every command is paused, autopilot just auto-attacks. A pause is saved with the list, so it follows you to your other
      devices with Save to cloud.
    </p>

    <h4>What you keep</h4>
    <ul>
      <li>
        This only happens when you have <strong>never saved</strong> a buff list for the area, or a fight list for that area and class.
        A list you saved is never replaced, and a list you emptied stays empty.
      </li>
      <li>
        The filled-in rows are a starting point. They are saved only when you change something; change, remove or reorder anything you
        like.
      </li>
      <li>The picks are a best guess from the game&apos;s data. Check the commands against what you really cast and use.</li>
    </ul>
  </article>
);

export default CombatHelp;
