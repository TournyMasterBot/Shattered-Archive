import type { AreaFile, Reset, ResetComment, ResetsSection } from '@shatteredarchive/merc-area';

import type { AreaWorkbench } from '../areas/workbench.js';

export type ResetEntry = Reset | ResetComment;

export interface VnumOption {
  vnum: number;
  label: string;
}

/** Options for the pickers: the area's own entities, by kind. */
export function entityOptions(area: AreaFile | null): { mob: VnumOption[]; object: VnumOption[]; room: VnumOption[] } {
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
export function VnumField({
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

export function NumArg({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
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
export const GROUP_COLORS = ['#7aa2f7', '#e0af68', '#9ece6a', '#f7768e', '#bb9af7', '#2ac3de'];

export interface ResetBlock {
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
export function computeBlocks(resets: ResetEntry[]): ResetBlock[] {
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

/**
 * The contiguous run of `P` rows right after an `O` reset that fill IT
 * specifically ("P fills the closest O above it" — ResetsPage's own help
 * text). NOT part of computeBlocks' grouping (that only groups M+G/E/P) since
 * an O's contents are identified by the P's arg3 matching the O's arg1
 * object vnum, not just position.
 */
export function contentsOf(resets: ResetEntry[], oIndex: number): number[] {
  const o = resets[oIndex];
  if (o.command !== 'O') return [];
  const indices: number[] = [];
  for (let i = oIndex + 1; i < resets.length; i++) {
    const r = resets[i];
    if (r.command !== 'P' || r.arg3 !== o.arg1) break;
    indices.push(i);
  }
  return indices;
}

export const COMMAND_NAMES: Record<Reset['command'], string> = {
  M: 'M — mob into room',
  O: 'O — object into room',
  P: 'P — object inside object',
  G: 'G — give to previous mob',
  E: 'E — equip on previous mob',
  D: 'D — door state',
  R: 'R — randomize exits',
};

export const DOOR_LABELS = [
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
export const DOOR_STATES = ['open', 'closed', 'closed + locked'];

export interface ResetsEditor {
  section: ResetsSection | undefined;
  resets: ResetEntry[];
  opts: { mob: VnumOption[]; object: VnumOption[]; room: VnumOption[] };
  blocks: ResetBlock[];
  blockAt: (idx: number) => ResetBlock;
  setResets: (next: ResetEntry[]) => void;
  update: (idx: number, patch: Partial<Reset>) => void;
  move: (idx: number, dir: -1 | 1) => void;
  moveBlock: (start: number, dir: -1 | 1) => void;
  remove: (idx: number) => void;
  addReset: (command: Reset['command']) => void;
}

/**
 * The resets array + its move-as-a-unit blocking, mutation closures, and
 * entity-option lists, over a shared `AreaWorkbench`. Extracted (2026-07-26)
 * from ResetsPage so the Areas dashboard's per-room equipment/contents
 * accordions can edit the SAME underlying `Reset` rows — a room's "equipment
 * on this mob" is literally this mob's `M` block's `G/E/P` riders, scoped by
 * index, not a separate copy of the data.
 */
export function useResetsEditor(wb: AreaWorkbench): ResetsEditor {
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

  const addReset = (command: Reset['command']) => {
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
    setResets([...resets, byCommand[command]]);
  };

  return { section, resets, opts, blocks, blockAt, setResets, update, move, moveBlock, remove, addReset };
}

/** Per-command field row for one Reset — the compact form ResetsPage and the Areas dashboard accordions share. */
export function ResetRowFields({
  reset: r,
  idx,
  opts,
  onChange,
}: {
  reset: Reset;
  idx: number;
  opts: { mob: VnumOption[]; object: VnumOption[]; room: VnumOption[] };
  onChange: (patch: Partial<Reset>) => void;
}) {
  switch (r.command) {
    case 'M':
      return (
        <>
          <VnumField label={`Reset ${idx + 1} mob`} value={r.arg1} options={opts.mob} onChange={(v) => onChange({ arg1: v })} />
          <VnumField label={`Reset ${idx + 1} room`} value={r.arg3} options={opts.room} onChange={(v) => onChange({ arg3: v })} />
          <NumArg label={`Reset ${idx + 1} world limit`} value={r.arg2} onChange={(v) => onChange({ arg2: v })} />
          <NumArg label={`Reset ${idx + 1} room limit`} value={r.arg4} onChange={(v) => onChange({ arg4: v })} />
        </>
      );
    case 'O':
      return (
        <>
          <VnumField label={`Reset ${idx + 1} object`} value={r.arg1} options={opts.object} onChange={(v) => onChange({ arg1: v })} />
          <VnumField label={`Reset ${idx + 1} room`} value={r.arg3} options={opts.room} onChange={(v) => onChange({ arg3: v })} />
        </>
      );
    case 'P':
      return (
        <>
          <VnumField label={`Reset ${idx + 1} object`} value={r.arg1} options={opts.object} onChange={(v) => onChange({ arg1: v })} />
          <VnumField label={`Reset ${idx + 1} container`} value={r.arg3} options={opts.object} onChange={(v) => onChange({ arg3: v })} />
          <NumArg label={`Reset ${idx + 1} limit`} value={r.arg2} onChange={(v) => onChange({ arg2: v })} />
          <NumArg label={`Reset ${idx + 1} count`} value={r.arg4} onChange={(v) => onChange({ arg4: v })} />
        </>
      );
    case 'G':
      return <VnumField label={`Reset ${idx + 1} object`} value={r.arg1} options={opts.object} onChange={(v) => onChange({ arg1: v })} />;
    case 'E':
      return (
        <>
          <VnumField label={`Reset ${idx + 1} object`} value={r.arg1} options={opts.object} onChange={(v) => onChange({ arg1: v })} />
          <NumArg label={`Reset ${idx + 1} wear location`} value={r.arg3} onChange={(v) => onChange({ arg3: v })} />
        </>
      );
    case 'D':
      return (
        <>
          <VnumField label={`Reset ${idx + 1} room`} value={r.arg1} options={opts.room} onChange={(v) => onChange({ arg1: v })} />
          <label className="mb-field">
            <span>Door</span>
            <select aria-label={`Reset ${idx + 1} door`} value={r.arg2} onChange={(e) => onChange({ arg2: Number(e.target.value) })}>
              {DOOR_LABELS.map((d, di) => (
                <option key={di} value={di}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-field">
            <span>State</span>
            <select aria-label={`Reset ${idx + 1} door state`} value={r.arg3} onChange={(e) => onChange({ arg3: Number(e.target.value) })}>
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
          <VnumField label={`Reset ${idx + 1} room`} value={r.arg1} options={opts.room} onChange={(v) => onChange({ arg1: v })} />
          <NumArg label={`Reset ${idx + 1} exit count`} value={r.arg2} onChange={(v) => onChange({ arg2: v })} />
        </>
      );
    default:
      return null;
  }
}
