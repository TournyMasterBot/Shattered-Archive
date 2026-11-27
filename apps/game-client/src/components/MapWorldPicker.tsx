// apps/game-client/src/components/MapWorldPicker.tsx
//
// A small "Map" choice at the top of the map window's gear: which world's map to draw. The window follows the connection by itself ("Automatic");
// this is for looking at another world's map by hand (the DSL map while connected to the other game, to debug it). It draws NOTHING when the
// build knows a single world (every production build), so it adds no control and no text there. It names no world: the worlds come from the registry.

import React from 'react';
import styles from '../styles/WorldMapWindow.module.scss';
import { mapWorldName, pickMapWorld, useMapWorldChoice } from '../features/worldmap/world';

const AUTOMATIC = 'auto';

const MapWorldPicker: React.FC = () => {
  const { worlds, automatic, pickedId } = useMapWorldChoice();
  if (worlds.length < 2) return null;
  return (
    <label className={styles.worldPick}>
      <span>Map</span>
      <select aria-label="Which map to show" value={pickedId ?? AUTOMATIC} onChange={(e) => pickMapWorld(e.target.value === AUTOMATIC ? null : e.target.value)}>
        <option value={AUTOMATIC}>{`Automatic (${mapWorldName(automatic)})`}</option>
        {worlds.map((world) => (
          <option key={world.id} value={world.id}>
            {mapWorldName(world)}
          </option>
        ))}
      </select>
    </label>
  );
};

export default MapWorldPicker;
