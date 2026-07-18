import { useState, type CSSProperties } from 'react';
import type { AreaFile, Reset, ResetComment, ResetsSection } from '@shatteredarchive/merc-area';

import PreviewPane from '../areas/PreviewPane.js';
import { AreaSidebar, WorkbenchManualPane, WorkbenchToast, WorkbenchToolbar, useAreaWorkbench } from '../areas/workbench.js';
import '../areas/areas.css';

type ResetEntry = Reset | ResetComment;

interface VnumOption {
  vnum: number;
  label: string;
}

/** Options for the pickers: the area's own entities, by kind. */
function entityOptions(area: AreaFile | null): { mob: VnumOption[]; object: VnumOption[]; room: VnumOption[] } {
  const opts = { mob: [] as VnumOption[], object: [] as VnumOption[], room: [] as VnumOption[] };
  for (const s of area?.sections ?? []) {
    if (s.kind === 'mobiles') for (const m of s.mobiles) opts.mob.push({ vnum: m.vnum, label: `#${m.vnum} ${m.shortDescr}` });
    if (s.kind === 'objects') for (const o of s.objects) opts.object.push({ vnum: o.vnum, label: `#${o.vnum} ${o.shortDescr}` });
    if (s.kind === 'rooms') for (const r of s.rooms) opts.room.push({ vnum: r.vnum, label: `#${r.vnum} ${r.name}` });
  }
  return opts;
}

/**
 * Number input with the area's own entities as suggestions. Free-text numbers
 * are allowed (cross-area vnums are legitimate); the caption shows what the
 * vnum resolves to locally.
 */
function VnumField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: VnumOption[];
  onChange: (n: number) => void;
}) {
  const listId = `mb-vnums-${label.replace(/\W+/g, '-').toLowerCase()}-${options.length}`;
  const known = options.find((o) => o.vnum === value);
  return (
    <label className="mb-field">
      <span>{label}</span>
      <input aria-label={label} type="number" list={listId} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.vnum} value={o.vnum}>
            {o.label}
          </option>
        ))}
      </datalist>
      <span className="mb-muted">{known ? known.label : 'not in this file (cross-area?)'}</span>
    </label>
  );
}

function NumArg({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="mb-field">
      <span>{label}</span>
      <input aria-label={label} type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  );
}

/**
 * Group palette (Phase 12b): cycled sequentially so adjacent mob groups never
 * share a color. Applied only where grouping exists — lone rows stay unstyled.
 */
const GROUP_COLORS = ['#7aa2f7', '#e0af68', '#9ece6a', '#f7768e', '#bb9af7', '#2ac3de'];

interface ResetBlock {
  start: number;
  span: number;
  /** Set only for M groups with members (span > 1). */
  colorIdx?: number;
}

/**
 * Partition the reset list into move-as-a-unit blocks: an M plus its
 * consecutive G/E/P followers form one block (they load onto that mob);
 * everything else is a single-row block.
 */
function computeBlocks(resets: ResetEntry[]): ResetBlock[] {
  const blocks: ResetBlock[] = [];
  let colorCount = 0;
  let i = 0;
  while (i < resets.length) {
    if (resets[i].command === 'M') {
      let j = i + 1;
      while (j < resets.length) {
        const c = resets[j].command;
        if (c === 'G' || c === 'E' || c === 'P') j++;
        else break;
      }
      const span = j - i;
      blocks.push(span > 1 ? { start: i, span, colorIdx: colorCount++ % GROUP_COLORS.length } : { start: i, span });
      i = j;
    } else {
      blocks.push({ start: i, span: 1 });
      i++;
    }
  }
  return blocks;
}

const COMMAND_NAMES: Record<Reset['command'], string> = {
  M: 'M — mob into room',
  O: 'O — object into room',
  P: 'P — object inside object',
  G: 'G — give to previous mob',
  E: 'E — equip on previous mob',
  D: 'D — door state',
  R: 'R — randomize exits',
};

const DOOR_LABELS = [
  'north',
  'east',
  'south',
  'west',
  'up',
  'down',
  'northeast',
  'northwest',
  'southeast',
  'southwest',
];
const DOOR_STATES = ['open', 'closed', 'closed + locked'];

/**
 * Resets tab: what spawns where, in file order (order matters — P/G/E act on
 * the most recent M/O above them). Same preview-first, write-gated flow as the
 * other tabs; comment lines are preserved read-only.
 */
export default function ResetsPage() {
  const wb = useAreaWorkbench();
  const [newCommand, setNewCommand] = useState<Reset['command']>('M');

  const section = wb.area?.sections.find((s): s is ResetsSection => s.kind === 'resets');
  const resets = section?.resets ?? [];
  const opts = entityOptions(wb.area);

  const setResets = (next: ResetEntry[]) => {
    if (!wb.area) return;
    if (section) {
      wb.setAreaModel({ sections: wb.area.sections.map((s) => (s === section ? { ...s, resets: next } : s)) });
    } else {
      wb.setAreaModel({ sections: [...wb.area.sections, { kind: 'resets', resets: next }] });
    }
  };

  const update = (idx: number, patch: Partial<Reset>) =>
    setResets(resets.map((r, i) => (i === idx && r.command !== '*' ? { ...r, ...patch } : r)));

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= resets.length) return;
    const next = [...resets];
    [next[idx], next[j]] = [next[j], next[idx]];
    setResets(next);
  };

  const blocks = computeBlocks(resets);
  const blockAt = (idx: number) => blocks.find((b) => idx >= b.start && idx < b.start + b.span)!;

  /** Move a whole block (an M with its G/E/P riders moves as one unit). */
  const moveBlock = (start: number, dir: -1 | 1) => {
    const bi = blocks.findIndex((b) => b.start === start);
    const bj = bi + dir;
    if (bi < 0 || bj < 0 || bj >= blocks.length) return;
    const first = blocks[Math.min(bi, bj)];
    const second = blocks[Math.max(bi, bj)];
    setResets([
      ...resets.slice(0, first.start),
      ...resets.slice(second.start, second.start + second.span),
      ...resets.slice(first.start, first.start + first.span),
      ...resets.slice(second.start + second.span),
    ]);
  };

  const remove = (idx: number) => setResets(resets.filter((_, i) => i !== idx));

  const addReset = () => {
    const mob = opts.mob[0]?.vnum ?? 0;
    const obj = opts.object[0]?.vnum ?? 0;
    const room = opts.room[0]?.vnum ?? 0;
    const base = { ifFlag: 0, arg1: 0, arg2: 0, arg3: 0, arg4: 0, comment: '' };
    const byCommand: Record<Reset['command'], Reset> = {
      M: { ...base, command: 'M', arg1: mob, arg2: 1, arg3: room, arg4: 1 },
      O: { ...base, command: 'O', arg1: obj, arg3: room },
      P: { ...base, command: 'P', arg1: obj, arg2: 1, arg3: obj, arg4: 1 },
      G: { ...base, command: 'G', arg1: obj, arg2: 1 },
      E: { ...base, command: 'E', arg1: obj, arg2: 1, arg3: 16 },
      D: { ...base, command: 'D', arg1: room },
      R: { ...base, command: 'R', arg1: room, arg2: 6 },
    };
    setResets([...resets, byCommand[newCommand]]);
  };

  const fieldsFor = (r: Reset, idx: number) => {
    switch (r.command) {
      case 'M':
        return (
          <>
            <VnumField label={`Reset ${idx + 1} mob`} value={r.arg1} options={opts.mob} onChange={(v) => update(idx, { arg1: v })} />
            <VnumField label={`Reset ${idx + 1} room`} value={r.arg3} options={opts.room} onChange={(v) => update(idx, { arg3: v })} />
            <NumArg label={`Reset ${idx + 1} world limit`} value={r.arg2} onChange={(v) => update(idx, { arg2: v })} />
            <NumArg label={`Reset ${idx + 1} room limit`} value={r.arg4} onChange={(v) => update(idx, { arg4: v })} />
          </>
        );
      case 'O':
        return (
          <>
            <VnumField label={`Reset ${idx + 1} object`} value={r.arg1} options={opts.object} onChange={(v) => update(idx, { arg1: v })} />
            <VnumField label={`Reset ${idx + 1} room`} value={r.arg3} options={opts.room} onChange={(v) => update(idx, { arg3: v })} />
          </>
        );
      case 'P':
        return (
          <>
            <VnumField label={`Reset ${idx + 1} object`} value={r.arg1} options={opts.object} onChange={(v) => update(idx, { arg1: v })} />
            <VnumField label={`Reset ${idx + 1} container`} value={r.arg3} options={opts.object} onChange={(v) => update(idx, { arg3: v })} />
            <NumArg label={`Reset ${idx + 1} limit`} value={r.arg2} onChange={(v) => update(idx, { arg2: v })} />
            <NumArg label={`Reset ${idx + 1} count`} value={r.arg4} onChange={(v) => update(idx, { arg4: v })} />
          </>
        );
      case 'G':
        return (
          <VnumField label={`Reset ${idx + 1} object`} value={r.arg1} options={opts.object} onChange={(v) => update(idx, { arg1: v })} />
        );
      case 'E':
        return (
          <>
            <VnumField label={`Reset ${idx + 1} object`} value={r.arg1} options={opts.object} onChange={(v) => update(idx, { arg1: v })} />
            <NumArg label={`Reset ${idx + 1} wear location`} value={r.arg3} onChange={(v) => update(idx, { arg3: v })} />
          </>
        );
      case 'D':
        return (
          <>
            <VnumField label={`Reset ${idx + 1} room`} value={r.arg1} options={opts.room} onChange={(v) => update(idx, { arg1: v })} />
            <label className="mb-field">
              <span>Door</span>
              <select aria-label={`Reset ${idx + 1} door`} value={r.arg2} onChange={(e) => update(idx, { arg2: Number(e.target.value) })}>
                {DOOR_LABELS.map((d, di) => (
                  <option key={di} value={di}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-field">
              <span>State</span>
              <select aria-label={`Reset ${idx + 1} door state`} value={r.arg3} onChange={(e) => update(idx, { arg3: Number(e.target.value) })}>
                {DOOR_STATES.map((s, si) => (
                  <option key={si} value={si}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </>
        );
      case 'R':
        return (
          <>
            <VnumField label={`Reset ${idx + 1} room`} value={r.arg1} options={opts.room} onChange={(v) => update(idx, { arg1: v })} />
            <NumArg label={`Reset ${idx + 1} exit count`} value={r.arg2} onChange={(v) => update(idx, { arg2: v })} />
          </>
        );
    }
  };

  return (
    <div className="mb-areas">
      <WorkbenchToast wb={wb} />
      <AreaSidebar wb={wb} />

      <main className="mb-area-main">
        {!wb.area && <p className="mb-muted">Select an area to edit its resets.</p>}

        {wb.area && (
          <>
            <WorkbenchToolbar wb={wb} />
            <WorkbenchManualPane wb={wb} />

            {!wb.manualOpen && (
            <div className="mb-form">
              <p className="mb-muted">
                Resets run top to bottom on every area repop. G (give) and E (equip) load onto the mob of the closest
                M line above them; P (put) fills the closest O above it.
              </p>

              <ol className="mb-reset-list">
                {resets.map((r, i) => {
                  const block = blockAt(i);
                  const grouped = block.colorIdx !== undefined;
                  const isAnchor = grouped && i === block.start;
                  const isMember = grouped && i > block.start;
                  const bi = blocks.findIndex((b) => b.start === block.start);
                  const rowClass = [
                    'mb-reset-row',
                    isAnchor ? 'mb-reset-row--anchor' : '',
                    isMember ? 'mb-reset-row--member' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const rowStyle = grouped
                    ? ({ '--mb-group-color': GROUP_COLORS[block.colorIdx!] } as CSSProperties)
                    : undefined;
                  return (
                    <li key={i} className={rowClass} style={rowStyle}>
                      {r.command === '*' ? (
                        <span className="mb-muted">* {r.comment}</span>
                      ) : (
                        <>
                          <span className="mb-reset-cmd" title={COMMAND_NAMES[r.command]}>
                            {r.command}
                          </span>
                          <div className="mb-row mb-reset-fields">{fieldsFor(r, i)}</div>
                          <span className="mb-reset-actions">
                            {isAnchor ? (
                              <>
                                <button
                                  type="button"
                                  aria-label={`Move reset ${i + 1} up`}
                                  title={`moves the mob with its ${block.span - 1} equip/give/put row(s) as one unit`}
                                  disabled={bi === 0}
                                  onClick={() => moveBlock(block.start, -1)}
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Move reset ${i + 1} down`}
                                  title={`moves the mob with its ${block.span - 1} equip/give/put row(s) as one unit`}
                                  disabled={bi === blocks.length - 1}
                                  onClick={() => moveBlock(block.start, 1)}
                                >
                                  ↓
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  aria-label={`Move reset ${i + 1} up`}
                                  disabled={i === 0}
                                  onClick={() => (grouped ? move(i, -1) : moveBlock(block.start, -1))}
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Move reset ${i + 1} down`}
                                  disabled={i === resets.length - 1}
                                  onClick={() => (grouped ? move(i, 1) : moveBlock(block.start, 1))}
                                >
                                  ↓
                                </button>
                              </>
                            )}
                            <button type="button" aria-label={`Remove reset ${i + 1}`} className="mb-danger" onClick={() => remove(i)}>
                              ✕
                            </button>
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>

              <div className="mb-row mb-reset-add">
                <label className="mb-field">
                  <span>New reset</span>
                  <select aria-label="New reset command" value={newCommand} onChange={(e) => setNewCommand(e.target.value as Reset['command'])}>
                    {(Object.keys(COMMAND_NAMES) as Reset['command'][]).map((c) => (
                      <option key={c} value={c}>
                        {COMMAND_NAMES[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mb-row-actions">
                  <button type="button" onClick={addReset}>
                    + Add reset
                  </button>
                </div>
              </div>
            </div>
            )}

            {wb.preview && <PreviewPane preview={wb.preview} onNavigate={(ref) => void wb.openArea(ref.file)} />}
          </>
        )}
      </main>
    </div>
  );
}
