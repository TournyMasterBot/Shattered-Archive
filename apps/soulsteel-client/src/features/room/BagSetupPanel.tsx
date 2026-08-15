import { useState } from 'react';

import {
  BAG_SETUP_ALIAS,
  LANGUAGE_LABELS,
  SCRIPT_LANGUAGES,
  bagSetupAliasSource,
  exampleBagSetupSource,
} from '../../domain/aliasScript.js';
import { compiledBagSetupCommands } from '../../domain/bagPlan.js';
import { findRole } from '../../domain/roleCatalog.js';
import type { RoomAction } from '../../domain/gameReducer.js';
import type { RoomState } from '../../domain/types.js';
import CommandsDialog from './CommandsDialog.js';
import RoleParchmentModal from './RoleParchmentModal.js';
import UserScriptDialog from './UserScriptDialog.js';

interface BagSetupPanelProps {
  room: RoomState;
  dispatch: (action: RoomAction) => void;
}

/**
 * Pre-stuffs numbered physical bags with role parchments ahead of the game: the Herald maps each
 * bag number to a role here, then later a player who draws bag N can be optimistically assigned
 * that role from the roster (`PlayerRoster`'s bag quick-assign) without the Herald needing to
 * remember the plan by heart. The manual role dropdown there always remains available to correct
 * a mis-stuffed bag.
 */
export default function BagSetupPanel({ room, dispatch }: BagSetupPanelProps) {
  const [parchmentBagNumber, setParchmentBagNumber] = useState<number | null>(null);
  const [showCompiled, setShowCompiled] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showAliasScript, setShowAliasScript] = useState(false);

  const parchmentBag = room.bags.find((b) => b.number === parchmentBagNumber) ?? null;
  const parchmentRole = parchmentBag ? findRole(room.roles, parchmentBag.roleId) : undefined;

  const stuffedBagCount = room.bags.filter((b) => findRole(room.roles, b.roleId)).length;
  const compiledCommands = compiledBagSetupCommands(room.roles, room.bags, room.bagContainerKeyword, room.masterBagKeyword);

  // Once at least one bag is actually mapped to a role, the placeholder example roles are just
  // noise next to real data — show this room's own compiled setup instead, same as "Use as
  // alias" below. The placeholder only earns its keep before anything is configured, to teach
  // the pattern.
  const templateVariants = SCRIPT_LANGUAGES.map((language) => ({
    language,
    label: LANGUAGE_LABELS[language],
    source:
      stuffedBagCount > 0
        ? bagSetupAliasSource(compiledCommands, language, room.commandDelayMs)
        : exampleBagSetupSource(language, room.commandDelayMs),
  }));
  const aliasScriptVariants = SCRIPT_LANGUAGES.map((language) => ({
    language,
    label: LANGUAGE_LABELS[language],
    source: bagSetupAliasSource(compiledCommands, language, room.commandDelayMs),
  }));

  return (
    <div className="ss-bag-setup">
      <div className="ss-bag-setup-controls">
        <label>
          Container keyword
          <input
            type="text"
            value={room.bagContainerKeyword}
            onChange={(e) => dispatch({ type: 'setBagContainerKeyword', keyword: e.target.value })}
            placeholder="sack"
            aria-label="Bag container keyword"
          />
        </label>
        <label>
          Number of bags
          <input
            type="number"
            min={0}
            value={room.bags.length}
            onChange={(e) => dispatch({ type: 'setBagCount', count: Number(e.target.value) || 0 })}
            aria-label="Number of bags"
          />
        </label>
      </div>

      {room.bags.length === 0 ? (
        <p className="ss-dialog-hint">Set a bag count to map roles into numbered bags.</p>
      ) : (
        <ul className="ss-bag-list">
          {room.bags.map((bag) => (
            <li key={bag.number} className="ss-bag-row">
              <span className="ss-bag-number">Bag {bag.number}</span>
              <select
                aria-label={`Role for bag ${bag.number}`}
                value={bag.roleId ?? ''}
                onChange={(e) =>
                  dispatch({ type: 'assignBagRole', number: bag.number, roleId: e.target.value || null })
                }
              >
                <option value="">Unassigned</option>
                {room.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ss-role-note-icon"
                aria-label={`Parchment commands for bag ${bag.number}`}
                title="Bag parchment commands"
                disabled={!bag.roleId}
                onClick={() => setParchmentBagNumber(bag.number)}
              >
                📜
              </button>
            </li>
          ))}
        </ul>
      )}

      {parchmentRole && parchmentBag && (
        <RoleParchmentModal
          role={parchmentRole}
          bag={{ number: parchmentBag.number, keyword: room.bagContainerKeyword }}
          onClose={() => setParchmentBagNumber(null)}
        />
      )}

      <div className="ss-master-bag">
        <label>
          Master bag keyword
          <input
            type="text"
            value={room.masterBagKeyword}
            onChange={(e) => dispatch({ type: 'setMasterBagKeyword', keyword: e.target.value })}
            placeholder="chest"
            aria-label="Master bag keyword"
          />
        </label>
        <label>
          Command delay (ms)
          <input
            type="number"
            min={0}
            step={50}
            value={room.commandDelayMs}
            onChange={(e) => dispatch({ type: 'setCommandDelayMs', delayMs: Number(e.target.value) || 0 })}
            aria-label="Command delay in milliseconds"
            title="How long a generated alias script waits between each staggered game command"
          />
        </label>
        <button
          type="button"
          className="ss-master-bag-compile"
          disabled={stuffedBagCount === 0}
          title={
            stuffedBagCount === 0
              ? 'Map at least one bag to a role first'
              : `Writes and bags all ${stuffedBagCount} assigned parchments, then gathers every bag into the master bag`
          }
          onClick={() => setShowCompiled(true)}
        >
          📜 Compiled setup commands
        </button>
        <button type="button" onClick={() => setShowTemplate(true)}>
          📜 Userscript template
        </button>
        <button
          type="button"
          disabled={stuffedBagCount === 0}
          title={stuffedBagCount === 0 ? 'Map at least one bag to a role first' : "A ready-to-bind alias script for this room's compiled setup"}
          onClick={() => setShowAliasScript(true)}
        >
          📜 Use as alias
        </button>
      </div>

      {showCompiled && (
        <CommandsDialog
          title={`Full game setup — ${stuffedBagCount} bag${stuffedBagCount === 1 ? '' : 's'} into the master bag`}
          dialogLabel="Compiled game setup commands"
          textareaLabel="Compiled setup commands"
          hint="Hand these commands to yourself before the game: writes and bags every assigned role's parchment, then gathers all the bags into the master bag in one pass."
          commands={compiledCommands}
          onClose={() => setShowCompiled(false)}
        />
      )}

      {showTemplate && (
        <UserScriptDialog
          title="Userscript template — write, bag, and gather into the aggregate"
          dialogLabel="Userscript template for the bag setup alias"
          hint={
            stuffedBagCount > 0
              ? "The write-parchment → bag → gather-into-the-aggregate flow for this room's actual configured bags, per scripting language — the same content as \"Use as alias\" below."
              : "A worked example of the write-parchment → bag → gather-into-the-aggregate flow, built from two placeholder roles since no bags are configured yet — map at least one bag to a role above to see this room's real setup here instead."
          }
          variants={templateVariants}
          onClose={() => setShowTemplate(false)}
        />
      )}

      {showAliasScript && (
        <UserScriptDialog
          title="Alias script — this room's compiled setup"
          dialogLabel="Alias script for this room's compiled bag setup"
          hint={`Create a new Alias script in your game-client's Scripts panel, set its alias to "${BAG_SETUP_ALIAS}", and paste in the source below for your client's scripting language. Typing that alias then runs this room's whole compiled setup — every assigned parchment written and bagged, then every bag gathered into the master bag — in one go.`}
          variants={aliasScriptVariants}
          onClose={() => setShowAliasScript(false)}
        />
      )}
    </div>
  );
}
