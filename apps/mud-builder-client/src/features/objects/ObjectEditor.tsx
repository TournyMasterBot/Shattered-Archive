import type { MudObject, ObjValue } from '@shatteredarchive/merc-area';
import { ITEM_TYPES, itemLookup, objValueKinds } from '@shatteredarchive/merc-area';

import { ATTACK_TYPES, EXTRA_FLAGS, LIQUIDS, WEAPON_TYPES, WEAR_FLAGS } from '../../data/flags.js';
import { FlagGrid, WordInput } from '../areas/workbench.js';

/** Human labels + word suggestions for the five values, per item type. */
function valueMeta(itemType: string): { labels: [string, string, string, string, string]; words: (string[] | null)[] } {
  switch (itemLookup(itemType)) {
    case 'weapon':
      return {
        labels: ['Weapon class', 'Damage dice count', 'Damage dice sides', 'Damage type', 'Weapon flag bits'],
        words: [WEAPON_TYPES, null, null, ATTACK_TYPES, null],
      };
    case 'container':
      return {
        labels: ['Capacity (weight)', 'Container flag bits', 'Key vnum', 'Max single item weight', 'Weight multiplier %'],
        words: [null, null, null, null, null],
      };
    case 'drink':
    case 'fountain':
      return {
        labels: ['Capacity', 'Amount left', 'Liquid', 'Poisoned (non-zero = yes)', 'Value 4'],
        words: [null, null, LIQUIDS, null, null],
      };
    case 'wand':
    case 'staff':
      return {
        labels: ['Spell level', 'Total charges', 'Charges left', 'Spell name', 'Value 4'],
        words: [null, null, null, null, null],
      };
    case 'potion':
    case 'pill':
    case 'scroll':
      return {
        labels: ['Spell level', 'Spell 1', 'Spell 2', 'Spell 3', 'Spell 4'],
        words: [null, null, null, null, null],
      };
    default:
      return {
        labels: ['Value 0', 'Value 1', 'Value 2', 'Value 3', 'Value 4'],
        words: [null, null, null, null, null],
      };
  }
}

function NumRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="mb-form-row">
      {label}
      <input aria-label={label} type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  );
}

/**
 * Form editor for one #OBJECTS entry. The five values change meaning (and
 * number-vs-word tokenization) with the item type — objValueKinds is the same
 * table db2.c load_objects uses, so what the form writes is exactly what the
 * game will read. Word fields stay verbatim; unlisted flag bits are preserved.
 */
export default function ObjectEditor({ obj, onChange }: { obj: MudObject; onChange: (o: MudObject) => void }) {
  const set = <K extends keyof MudObject>(key: K, value: MudObject[K]) => onChange({ ...obj, [key]: value });

  const kinds = objValueKinds(obj.itemType);
  const meta = valueMeta(obj.itemType);

  const setValue = (i: number, v: ObjValue) => {
    const next = [...obj.values] as MudObject['values'];
    next[i] = v;
    set('values', next);
  };

  const setExtraDescr = (i: number, keyword: string, description: string) => {
    set(
      'extraDescrs',
      obj.extraDescrs.map((ed, j) => (j === i ? { keyword, description } : ed)),
    );
  };

  return (
    <div className="mb-script-editor mb-obj-editor">
      <h4>
        Object #{obj.vnum} — {obj.shortDescr}
      </h4>

      <label className="mb-form-row">
        Keywords
        <input aria-label="Keywords" value={obj.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label className="mb-form-row">
        Short description
        <input aria-label="Short description" value={obj.shortDescr} onChange={(e) => set('shortDescr', e.target.value)} />
      </label>
      <label className="mb-form-row">
        Description (in room)
        <input aria-label="Description" value={obj.description} onChange={(e) => set('description', e.target.value)} />
      </label>

      <div className="mb-form-grid">
        <WordInput label="Item type" value={obj.itemType} words={[...ITEM_TYPES]} onChange={(v) => set('itemType', v)} />
        <WordInput label="Material" value={obj.material} words={['unknown']} onChange={(v) => set('material', v)} />
        <NumRow label="Level" value={obj.level} onChange={(v) => set('level', v)} />
        <NumRow label="Weight" value={obj.weight} onChange={(v) => set('weight', v)} />
        <NumRow label="Cost" value={obj.cost} onChange={(v) => set('cost', v)} />
        <WordInput
          label="Condition"
          value={obj.condition}
          words={['P', 'G', 'A', 'W', 'D', 'B', 'R']}
          onChange={(v) => set('condition', v)}
        />
      </div>

      <fieldset className="mb-flag-grid">
        <legend>Values ({itemLookup(obj.itemType) ?? 'unknown type — raw'})</legend>
        <div className="mb-form-grid">
          {kinds.map((kind, i) =>
            kind === 'word' ? (
              <WordInput
                key={i}
                label={meta.labels[i]}
                value={String(obj.values[i])}
                words={meta.words[i] ?? []}
                onChange={(v) => setValue(i, v)}
              />
            ) : (
              <NumRow
                key={i}
                label={kind === 'flag' ? `${meta.labels[i]} (flag bits)` : meta.labels[i]}
                value={Number(obj.values[i]) || 0}
                onChange={(v) => setValue(i, v)}
              />
            ),
          )}
        </div>
      </fieldset>

      <FlagGrid label="Extra flags" flags={EXTRA_FLAGS} value={obj.extraFlags} onChange={(v) => set('extraFlags', v)} />
      <FlagGrid label="Wear flags" flags={WEAR_FLAGS} value={obj.wearFlags} onChange={(v) => set('wearFlags', v)} />

      <fieldset className="mb-flag-grid">
        <legend>Extra descriptions ({obj.extraDescrs.length})</legend>
        {obj.extraDescrs.map((ed, i) => (
          <div key={i} className="mb-extra-descr">
            <label className="mb-form-row">
              Keyword(s)
              <input
                aria-label={`Extra description ${i + 1} keywords`}
                value={ed.keyword}
                onChange={(e) => setExtraDescr(i, e.target.value, ed.description)}
              />
            </label>
            <label className="mb-form-row">
              Text
              <textarea
                aria-label={`Extra description ${i + 1} text`}
                rows={3}
                value={ed.description}
                onChange={(e) => setExtraDescr(i, ed.keyword, e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => set('extraDescrs', obj.extraDescrs.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set('extraDescrs', [...obj.extraDescrs, { keyword: '', description: '' }])}
        >
          + Add extra description
        </button>
      </fieldset>

      {(obj.affects.length > 0 || obj.flagAffects.length > 0) && (
        <p className="mb-muted">
          {obj.affects.length + obj.flagAffects.length} affect line(s) (A/F …) preserved verbatim.
        </p>
      )}
    </div>
  );
}
