import type { Dice, Mobile } from '@shatteredarchive/merc-area';

import {
  ACT_FLAGS,
  AFFECT_FLAGS,
  ATTACK_TYPES,
  OFF_FLAGS,
  POSITIONS,
  RACES,
  RESIST_FLAGS,
  SEXES,
  SIZES,
} from '../../data/flags.js';
import { FlagGrid, WordInput } from '../areas/workbench.js';

function NumRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="mb-form-row">
      {label}
      <input aria-label={label} type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  );
}

function DiceRow({
  label,
  dice,
  onChange,
}: {
  label: string;
  dice: Dice;
  onChange: (d: Dice) => void;
}) {
  return (
    <div className="mb-form-row mb-dice-row">
      <span>{label}</span>
      <input
        aria-label={`${label} count`}
        type="number"
        value={dice.number}
        onChange={(e) => onChange({ ...dice, number: Number(e.target.value) || 0 })}
      />
      d
      <input
        aria-label={`${label} sides`}
        type="number"
        value={dice.type}
        onChange={(e) => onChange({ ...dice, type: Number(e.target.value) || 0 })}
      />
      +
      <input
        aria-label={`${label} bonus`}
        type="number"
        value={dice.bonus}
        onChange={(e) => onChange({ ...dice, bonus: Number(e.target.value) || 0 })}
      />
    </div>
  );
}

/**
 * Form editor for one #MOBILES entry. Word fields (race, damage type,
 * positions, sex, size, material) are stored VERBATIM in the file — the inputs
 * suggest known values but never coerce, so unusual area files survive a
 * round trip untouched. Unlisted flag bits are likewise preserved.
 */
export default function MobEditor({ mob, onChange }: { mob: Mobile; onChange: (m: Mobile) => void }) {
  const set = <K extends keyof Mobile>(key: K, value: Mobile[K]) => onChange({ ...mob, [key]: value });

  return (
    <div className="mb-script-editor mb-mob-editor">
      <h4>
        Mob #{mob.vnum} — {mob.shortDescr}
      </h4>

      <label className="mb-form-row">
        Keywords
        <input aria-label="Keywords" value={mob.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label className="mb-form-row">
        Short description
        <input aria-label="Short description" value={mob.shortDescr} onChange={(e) => set('shortDescr', e.target.value)} />
      </label>
      <label className="mb-form-row">
        Long description (shown in room)
        <input aria-label="Long description" value={mob.longDescr} onChange={(e) => set('longDescr', e.target.value)} />
      </label>
      <label className="mb-form-row">
        Description (on look)
        <textarea
          aria-label="Description"
          rows={4}
          value={mob.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </label>

      <div className="mb-form-grid">
        <WordInput label="Race" value={mob.race} words={RACES} onChange={(v) => set('race', v)} />
        <WordInput label="Material" value={mob.material} words={['unknown']} onChange={(v) => set('material', v)} />
        <NumRow label="Level" value={mob.level} onChange={(v) => set('level', v)} />
        <NumRow label="Alignment" value={mob.alignment} onChange={(v) => set('alignment', v)} />
        <NumRow label="Hitroll" value={mob.hitroll} onChange={(v) => set('hitroll', v)} />
        <NumRow label="Group" value={mob.group} onChange={(v) => set('group', v)} />
        <NumRow label="Wealth" value={mob.wealth} onChange={(v) => set('wealth', v)} />
      </div>

      <DiceRow label="Hit dice" dice={mob.hit} onChange={(d) => set('hit', d)} />
      <DiceRow label="Mana dice" dice={mob.mana} onChange={(d) => set('mana', d)} />
      <DiceRow label="Damage dice" dice={mob.damage} onChange={(d) => set('damage', d)} />
      <WordInput label="Damage type" value={mob.damType} words={ATTACK_TYPES} onChange={(v) => set('damType', v)} />

      <div className="mb-form-row mb-dice-row">
        <span>AC (pierce / bash / slash / exotic)</span>
        {mob.ac.map((v, i) => (
          <input
            key={i}
            aria-label={`AC ${['pierce', 'bash', 'slash', 'exotic'][i]}`}
            type="number"
            value={v}
            onChange={(e) => {
              const next = [...mob.ac] as Mobile['ac'];
              next[i] = Number(e.target.value) || 0;
              set('ac', next);
            }}
          />
        ))}
      </div>

      <div className="mb-form-grid">
        <WordInput label="Start position" value={mob.startPos} words={POSITIONS} onChange={(v) => set('startPos', v)} />
        <WordInput label="Default position" value={mob.defaultPos} words={POSITIONS} onChange={(v) => set('defaultPos', v)} />
        <WordInput label="Sex" value={mob.sex} words={SEXES} onChange={(v) => set('sex', v)} />
        <WordInput label="Size" value={mob.size} words={SIZES} onChange={(v) => set('size', v)} />
      </div>

      <FlagGrid label="Act flags" flags={ACT_FLAGS} value={mob.act} onChange={(v) => set('act', v)} />
      <FlagGrid label="Affected by" flags={AFFECT_FLAGS} value={mob.affectedBy} onChange={(v) => set('affectedBy', v)} />
      <FlagGrid label="Offense" flags={OFF_FLAGS} value={mob.offFlags} onChange={(v) => set('offFlags', v)} />
      <FlagGrid label="Immune" flags={RESIST_FLAGS} value={mob.immFlags} onChange={(v) => set('immFlags', v)} />
      <FlagGrid label="Resist" flags={RESIST_FLAGS} value={mob.resFlags} onChange={(v) => set('resFlags', v)} />
      <FlagGrid label="Vulnerable" flags={RESIST_FLAGS} value={mob.vulnFlags} onChange={(v) => set('vulnFlags', v)} />

      <div className="mb-form-grid">
        <NumRow label="Form bits (raw)" value={mob.form} onChange={(v) => set('form', v)} />
        <NumRow label="Parts bits (raw)" value={mob.parts} onChange={(v) => set('parts', v)} />
      </div>

      {mob.flagRemovals.length > 0 && (
        <p className="mb-muted">
          {mob.flagRemovals.length} race-trait removal line(s) (F …) preserved verbatim.
        </p>
      )}
    </div>
  );
}
