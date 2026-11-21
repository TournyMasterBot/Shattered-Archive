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

    <h4>Only in or out of combat, and the enemy&apos;s condition</h4>
    <p>
      Each buff and fight command has a <strong>send</strong> choice: <em>any time</em>, <em>only in combat</em> or <em>only out of combat</em>.
      Autopilot keeps to it itself, whatever the game would answer, so a heal you can only cast out of a fight (the shadow knight&apos;s dark
      heal, for example) is never tried in one. A heal like that is also tried again after every fight while your HP is under its gate.
    </p>
    <p>
      <strong>only when the enemy is</strong> below or above one of the game&apos;s condition phrases (&quot;has quite a few wounds&quot;, &quot;looks pretty
      hurt&quot;, ...). The game only describes the enemy in words, so the percent after each phrase is <strong>approximate</strong>. It only applies
      during a fight, and until the game has said how the enemy looks, it does not hold anything back. If you also set your own HP, MP or
      stamina gate, <strong>both</strong> have to be true.
    </p>

    <h4>If a cast fails</h4>
    <p>
      For a buff that is checked by its affect, <strong>retry until the affect shows</strong> (on by default) makes autopilot try again when the cast
      fails (&quot;You lost your concentration.&quot;) or the affect does not appear: up to 3 tries, a few seconds apart, one command at a time, then a line
      in the terminal says it gave up. It does not retry when you are out of mana or the potion is gone. A potion, wand or staff
      (<code>quaff</code>, <code>brandish</code>, <code>zap</code>) is used again whenever its affect drops, in or out of a fight.
    </p>

    <h4>When autopilot pauses itself</h4>
    <p>
      If the game does not answer in time (after a move, at the end of a fight, or during a wait) autopilot does <strong>not</strong> stop. It pauses,
      and the status line says what it was waiting for, for example <em>Paused: no reply to &quot;n&quot;. Press Resume to continue.</em> Press{' '}
      <strong>Resume</strong> and it carries on from where it was, or <strong>Stop</strong> to end the run. While it is paused you can also fix a
      buff or a fight command and then resume.
    </p>

    <h4>What gets sent to the game</h4>
    <p>
      <code>{'{name}'}</code> in a command is replaced by the kill keyword of the creature you are fighting, so{' '}
      <code>cast &apos;fire&apos; {'{name}'}</code> goes out as <code>cast &apos;fire&apos; elf</code>. Outside a fight there is no target,
      so the <code>{'{name}'}</code> is simply left out. A command that still has something to fill in, such as{' '}
      <code>quaff &lt;potion&gt;</code>, is <strong>not sent</strong>: autopilot prints one line in the terminal saying which command it
      skipped. Replace the part in the brackets with the real item (for example <code>quaff haste</code>).
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
      <li>
        The <strong>reuse time</strong> a new fight command starts with and the <strong>recast interval</strong> of a new tick-based buff come from timing measured in the game
        (how long an ability keeps you busy, and the longest its effect has been seen to last). An ability nobody has measured yet starts with the usual defaults. Change them freely;
        a command you already saved is never changed by this.
      </li>
    </ul>
  </article>
);

export default CombatHelp;
