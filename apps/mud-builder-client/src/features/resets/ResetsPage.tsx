import { useState, type CSSProperties } from 'react';
import type { Reset } from '@shatteredarchive/merc-area';

import PreviewPane from '../areas/PreviewPane.js';
import { AreaSidebar, WorkbenchManualPane, WorkbenchToast, WorkbenchToolbar, useAreaWorkbench } from '../areas/workbench.js';
import SimulatePane from './SimulatePane.js';
import { COMMAND_NAMES, GROUP_COLORS, ResetRowFields, useResetsEditor } from './reset-editing.js';
import '../areas/areas.css';

/**
 * Resets tab: what spawns where, in file order (order matters — P/G/E act on
 * the most recent M/O above them). Same preview-first, write-gated flow as the
 * other tabs; comment lines are preserved read-only.
 */
export default function ResetsPage({
  initialRoomTarget,
  onEditRoom,
}: {
  initialRoomTarget?: { vnum: number } | null;
  /** Simulate pane's "Edit this room" reverse link — jumps to the Rooms tab's editor. */
  onEditRoom?: (vnum: number, file: string) => void;
} = {}) {
  const wb = useAreaWorkbench();
  const [newCommand, setNewCommand] = useState<Reset['command']>('M');
  const { resets, opts, blocks, blockAt, update, move, moveBlock, remove, addReset } = useResetsEditor(wb);

  return (
    <div className="mb-areas">
      <WorkbenchToast wb={wb} />
      <AreaSidebar wb={wb} onBeforeOpen={() => wb.confirmDiscard('switch areas')} />

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
                          <div className="mb-row mb-reset-fields">
                            <ResetRowFields reset={r} idx={i} opts={opts} onChange={(patch) => update(i, patch)} />
                          </div>
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
                  <button type="button" onClick={() => addReset(newCommand)}>
                    + Add reset
                  </button>
                </div>
              </div>
            </div>
            )}

            <SimulatePane file={wb.file} area={wb.area} initialRoomTarget={initialRoomTarget} onEditRoom={onEditRoom} />

            {wb.preview && <PreviewPane preview={wb.preview} onNavigate={(ref) => void wb.openArea(ref.file)} />}
          </>
        )}
      </main>
    </div>
  );
}
