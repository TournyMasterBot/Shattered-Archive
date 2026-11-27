// apps/game-client/src/components/MapHelp.tsx
//
// The map window's help: what it shows and how to use it. It replaces the window's body while the blue (i) is on. Production feature, like the
// window. The same text is in docs/shattered-maps/user-guide.md ("The map in the game client").
import React from 'react';
import styles from '../styles/HelpInfo.module.scss';

export interface MapHelpProps {
  onBack: () => void;
}

const MapHelp: React.FC<MapHelpProps> = ({ onBack }) => (
  <article className={styles.help} aria-label="Map help">
    <button type="button" className={styles.helpBack} onClick={onBack}>
      ← Back to the map
    </button>
    <h3>About the map</h3>
    <p>
      The map shows the area you are standing in, with your room outlined in gold, and follows you as you walk. You can still play while it is open: it
      floats over the game, and you can drag its title bar to move it and its corner to resize it.
    </p>

    <h4>Where you are</h4>
    <ul>
      <li>
        <strong>You are here</strong>: the room&apos;s title and exits match one room. <strong>You are probably here</strong>: only the title matched.{' '}
        <strong>One of N rooms that look alike</strong>: every room that fits is marked.
      </li>
      <li>
        A <strong>red dot</strong> sits on your room (fainter when it is only probably this room, or one of several). The button with the red dot under ⌖ turns it off and on; it is on
        until you turn it off, and only shows when the map knows where you are.
      </li>
      <li>
        <strong>… is not on the map yet</strong>: the room is not in the published map. Use <em>Add this room…</em> at the bottom to put it on your own map.
      </li>
    </ul>

    <h4>Moving around</h4>
    <ul>
      <li>Drag to move the map, scroll or use + and − to zoom, ⤢ to fit the whole floor, ⌖ to centre on yourself again.</li>
      <li>
        Arrow keys move, <kbd>+</kbd> and <kbd>−</kbd> zoom, <kbd>PageUp</kbd> and <kbd>PageDown</kbd> change floor, <kbd>Home</kbd> returns to you.
      </li>
      <li>The strip at the left lists the floors. The floors just above and below show faintly behind the one you look at; click a faint room to go there.</li>
      <li>An arrow at the edge is an exit into another area: click it to look there, and Reset view to come back.</li>
    </ul>

    <h4>Mazes and tangled exits</h4>
    <p>
      An exit that does not lead to the room next to it is not drawn as a long line across the map. It is a small chip on the edge of the room, on the side
      the exit points: a round chip means the exit does not lead straight on, a square one means it lands far away (a teleport). Select the room and a
      line is drawn out of each exit to the room it lands in, each in its own colour with the room it reaches tinted and ringed in the same colour, so the many
      exits of a maze stay out of the way until you ask where one goes. A small arrow on a plain line marks a one-way join. Maze rooms are
      amber octagons (like every room: the game has eight compass directions); a room with such an exit in an ordinary area is a purple octagon.
    </p>
    <p>
      Small labels on the rooms of a maze: IN is a way into the maze from outside, OUT is an exit to another area, END is a dead end, and 1-WAY is a room you
      can land in but cannot leave back the way you came.
    </p>

    <h4>Settings (the gear)</h4>
    <ul>
      <li>Other floors, room names on or off.</li>
      <li>
        <strong>Fog of war</strong> (off by default): show only the rooms your account, or the character you play, has actually visited. A small eye in the
        title bar shows it is on. You can switch it off at any time.
      </li>
      <li>
        <strong>Add a room by hand…</strong> opens the same form as <em>Add this room…</em> with nothing filled in.
      </li>
      <li>
        <strong>Cloud backup</strong>: sign in to your Shattered Archive account and press <em>Sync now</em> to save the ids of the rooms you explored and
        added on your account, and to bring in what your other devices saved. Nothing is sent until you press it, only you can read it, and it holds ids
        only. <em>Erase my backup…</em> removes your account&apos;s copy.
      </li>
    </ul>

    <h4>Your own rooms</h4>
    <p>
      A room you add is filed under a continent, an area and a subzone you choose (or name), with the room each exit leads to if you know it. It is kept in
      this browser, for the game you are connected to, on top of the published map; it never changes the published map. The form is filled in from what
      your own play already knows about the room when it can be, and <em>Rooms I added</em> lets you take one back.
    </p>
  </article>
);

export default MapHelp;
