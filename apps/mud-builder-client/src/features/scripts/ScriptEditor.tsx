import { ROOM_SCRIPT_TRIGGERS, SCRIPT_TRIGGERS, type MobScript } from '@shatteredarchive/merc-area';

import SaveAsSnippetButton from '../content/SaveAsSnippetButton.js';

interface MobOption {
  vnum: number;
  shortDescr: string;
}

interface RoomOption {
  vnum: number;
  name: string;
}

interface Props {
  script: MobScript;
  mobs: MobOption[];
  /** Room list for room-attached (R) scripts — Phase 12b teleports. */
  rooms?: RoomOption[];
  onChange: (updated: MobScript) => void;
  onDelete: () => void;
}

const PHRASE_HINTS: Record<string, string> = {
  act: 'text to match in the observed action (empty = any)',
  speech: 'text to match in says/tells, case-insensitive substring (empty = any)',
  rand: 'percent chance per mobile pulse, 1-100',
  fight: 'percent chance per combat round, 1-100',
  death: 'percent chance on death, 1-100 (usually 100)',
  greet: 'percent chance when a player walks in, 1-100',
  entry: 'percent chance when this mob walks into a room, 1-100',
  give: "object name word to match, or 'all' / empty for any item",
  bribe: 'minimum gold amount that triggers',
};

/** Form editor for a single mob or room script (trigger, phrase, body). */
export default function ScriptEditor({ script, mobs, rooms = [], onChange, onDelete }: Props) {
  const set = (patch: Partial<MobScript>) => onChange({ ...script, ...patch });
  const isRoom = script.attach === 'room';
  const triggers: readonly string[] = isRoom ? ROOM_SCRIPT_TRIGGERS : SCRIPT_TRIGGERS;

  return (
    <div className="mb-form mb-script-editor">
      <SaveAsSnippetButton kind="script" data={script} />
      <div className="mb-row">
        <label className="mb-field mb-field--grow">
          <span>{isRoom ? 'Room' : 'Mob'}</span>
          {isRoom ? (
            <select
              aria-label="Script room"
              value={script.mobVnum}
              onChange={(e) => set({ mobVnum: Number(e.target.value) })}
            >
              {rooms.map((r) => (
                <option key={r.vnum} value={r.vnum}>
                  #{r.vnum} {r.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              aria-label="Script mob"
              value={script.mobVnum}
              onChange={(e) => set({ mobVnum: Number(e.target.value) })}
            >
              {mobs.map((m) => (
                <option key={m.vnum} value={m.vnum}>
                  #{m.vnum} {m.shortDescr}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="mb-field">
          <span>Trigger</span>
          <select
            aria-label="Script trigger"
            value={script.trigger}
            onChange={(e) => set({ trigger: e.target.value })}
          >
            {!triggers.includes(script.trigger) && (
              <option value={script.trigger}>{script.trigger} (unknown!)</option>
            )}
            {triggers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className="mb-row-actions">
          <button type="button" className="mb-danger" onClick={onDelete}>
            Delete script
          </button>
        </div>
      </div>

      <label className="mb-field">
        <span>Phrase</span>
        <input
          aria-label="Script phrase"
          type="text"
          value={script.phrase}
          placeholder={isRoom ? 'unused for room entry scripts' : (PHRASE_HINTS[script.trigger] ?? '')}
          onChange={(e) => set({ phrase: e.target.value })}
        />
        <span className="mb-muted">
          {isRoom
            ? 'unused for room entry scripts (fires on every walk-in)'
            : (PHRASE_HINTS[script.trigger] ?? 'match argument for this trigger')}
        </span>
      </label>

      <label className="mb-field">
        <span>Script body</span>
        <textarea
          aria-label="Script body"
          className="mb-mono"
          rows={10}
          value={script.body}
          spellCheck={false}
          onChange={(e) => set({ body: e.target.value })}
        />
      </label>

      <details className="mb-script-vocab">
        <summary>Command vocabulary</summary>
        {isRoom ? (
          <pre>{`echo <text>       message to the walker only
echoroom <text>   message to everyone else in the room
warp <room-vnum>  teleport the walker to that room

Fires when a character WALKS into this room (not on goto/summon/warp
arrival — warps never chain). No '~' characters. Max 256 lines.`}</pre>
        ) : (
          <pre>{`say <text>              emote <text>            echo <text>
goto <room-vnum>        transfer <name> [vnum]  force <name> <command>
mload <mob-vnum>        oload <obj-vnum>        purge [name]
if <check> ... else ... endif
checks: rand <pct> | ispc | isnpc | level <op> <n> | name <word>
$n = the triggering character, $i = this mob. '*' starts a comment.
No '~' characters. Max 256 lines per script.`}</pre>
        )}
      </details>
    </div>
  );
}
