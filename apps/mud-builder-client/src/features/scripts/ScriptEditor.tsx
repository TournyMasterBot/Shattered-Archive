import { SCRIPT_TRIGGERS, type MobScript } from '@shatteredarchive/merc-area';

interface MobOption {
  vnum: number;
  shortDescr: string;
}

interface Props {
  script: MobScript;
  mobs: MobOption[];
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

/** Form editor for a single mob script (trigger, phrase, body). */
export default function ScriptEditor({ script, mobs, onChange, onDelete }: Props) {
  const set = (patch: Partial<MobScript>) => onChange({ ...script, ...patch });

  return (
    <div className="mb-script-editor">
      <div className="mb-form-row">
        <label>
          Mob
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
        </label>
        <label>
          Trigger
          <select
            aria-label="Script trigger"
            value={script.trigger}
            onChange={(e) => set({ trigger: e.target.value })}
          >
            {!SCRIPT_TRIGGERS.includes(script.trigger as (typeof SCRIPT_TRIGGERS)[number]) && (
              <option value={script.trigger}>{script.trigger} (unknown!)</option>
            )}
            {SCRIPT_TRIGGERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="mb-danger" onClick={onDelete}>
          Delete script
        </button>
      </div>

      <label className="mb-form-row">
        Phrase
        <input
          aria-label="Script phrase"
          type="text"
          value={script.phrase}
          placeholder={PHRASE_HINTS[script.trigger] ?? ''}
          onChange={(e) => set({ phrase: e.target.value })}
        />
      </label>
      <p className="mb-muted">{PHRASE_HINTS[script.trigger] ?? 'match argument for this trigger'}</p>

      <label className="mb-form-row">
        Script body
        <textarea
          aria-label="Script body"
          rows={10}
          value={script.body}
          spellCheck={false}
          onChange={(e) => set({ body: e.target.value })}
        />
      </label>

      <details className="mb-script-vocab">
        <summary>Command vocabulary</summary>
        <pre>{`say <text>              emote <text>            echo <text>
goto <room-vnum>        transfer <name> [vnum]  force <name> <command>
mload <mob-vnum>        oload <obj-vnum>        purge [name]
if <check> ... else ... endif
checks: rand <pct> | ispc | isnpc | level <op> <n> | name <word>
$n = the triggering character, $i = this mob. '*' starts a comment.
No '~' characters. Max 256 lines per script.`}</pre>
      </details>
    </div>
  );
}
