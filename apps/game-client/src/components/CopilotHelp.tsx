// apps/game-client/src/components/CopilotHelp.tsx
//
// The Copilot help file: what Copilot is, how to get it working, what to do with a suggestion, and what it will never do by itself. It replaces the
// body of the Copilot window while the blue (i) is on. Plain text for the person who just turned Copilot on and sees nothing happening; the
// developer notes are in docs/copilot/ and the same help is in the user guide (docs/copilot/user-guide.md of the DSL repository). Local build only:
// it is imported by the Copilot window, which only a flagged build contains.
import React from 'react';
import styles from '../styles/HelpInfo.module.scss';

export interface CopilotHelpProps {
  onBack: () => void;
}

const CopilotHelp: React.FC<CopilotHelpProps> = ({ onBack }) => (
  <article className={styles.help} aria-label="Copilot help">
    <button type="button" className={styles.helpBack} onClick={onBack}>
      ← Back to Copilot
    </button>
    <h3>About Copilot</h3>
    <p>
      Copilot is a training companion that runs on your own machine, beside Autopilot. It watches your game, suggests the next command and learns from the
      way you answer. <strong>It only suggests.</strong> Nothing reaches the game until you approve or correct it, unless you have switched on a rule
      yourself in Settings.
    </p>

    <h4>Getting started</h4>
    <ol>
      <li>
        Turn the <strong>switch</strong> in the title bar on. Copilot is off until you do, and nothing is asked of its server or sent to the game while it
        is off.
      </li>
      <li>
        Look at the <strong>status</strong> next to it. <em>Online</em> means Copilot&apos;s server on this machine is answering; <em>Offline</em> means
        it is not running, and then nothing is suggested.
      </li>
      <li>Connect to the game and play. Copilot reads what the game shows and puts a card on the Suggestions tab when it has something worth doing.</li>
      <li>Answer each card: Approve, Correct or Reject.</li>
    </ol>

    <h4>If nothing happens</h4>
    <ul>
      <li>
        <strong>Off</strong> in the title bar: the switch is off. Turn it on.
      </li>
      <li>
        <strong>Offline</strong>: Copilot&apos;s server is not reachable. It is a program on this machine, not part of the game; start it, then the status
        turns Online by itself.
      </li>
      <li>
        <strong>Online, game quiet</strong>: the server is there but has seen no game text for a while. Connect to the game, or do something in it.
      </li>
      <li>
        <strong>No suggestions yet</strong> while Online: Copilot has not seen anything it can act on. It does not guess to fill the list. The{' '}
        <em>Mode</em> you chose (Battle, Exploration, Questing, Leveling) changes what it looks for.
      </li>
    </ul>

    <h4>Answering a suggestion</h4>
    <ul>
      <li>
        <strong>Approve</strong> sends the command as it is, and tells Copilot it was right.
      </li>
      <li>
        <strong>Correct</strong> lets you change the command and asks you to say <em>why</em> (3 to 280 characters). The corrected command is sent and your
        reason is what Copilot learns from. Say what was wrong and what it should have done.
      </li>
      <li>
        <strong>Reject</strong> sends nothing. You may say why.
      </li>
      <li>
        Under <em>Situation</em> on a card is what Copilot saw. The <em>confidence</em> is how sure it is; a rating from the model alone is never trusted by
        itself, it is held down by how often you have approved this kind of suggestion.
      </li>
      <li>
        A command is never sent while you are typing (about two seconds after your last key) or while Autopilot is running; the card says so and waits.
      </li>
    </ul>

    <h4>Settings and automatic approval</h4>
    <p>
      Every kind of action starts as <strong>ask</strong>. In the Settings tab you can allow a kind to run by itself, with a confidence threshold. Even
      then it only runs after you have answered at least 20 suggestions of that kind, and only when its confidence clears the threshold. Automatic
      approval works only while the Copilot window is open.
    </p>

    <h4>What Copilot never does by itself</h4>
    <ul>
      <li>Losing or spending items or gold, speaking to other players, anything that cannot be undone, and player-kill. These always ask you.</li>
      <li>Starting a fight it does not understand. Before a fight Copilot looks the monster up (and uses the game&apos;s consider when it cannot find it).</li>
      <li>
        Anything it does not recognise: it asks you and files a ticket so a teaching session can look at it.
      </li>
    </ul>

    <h4>Fights</h4>
    <p>
      Copilot follows a fight as it happens, because the game moves faster than a model can answer. It reads the damage and the monster&apos;s condition
      each round and decides to continue, finish or flee. Fleeing a fight that is being lost is decided by Copilot&apos;s own code, without waiting for a
      model.
    </p>

    <h4>Claude training (the Simulacrum only)</h4>
    <p>
      When you are connected to the Simulacrum, Settings offers a switch that lets Claude stand in for you as the trainer. A banner says so while it is on.
      It is never offered for the real game, it turns itself off when the connection closes, and what it teaches is kept apart from your own answers.
    </p>

    <h4>Where your data is</h4>
    <p>
      Everything stays on this machine. Copilot&apos;s server keeps its notes and your answers in its own data folder; characters are known there by a
      codename, not their names. Nothing is sent to a hosted service.
    </p>
  </article>
);

export default CopilotHelp;
