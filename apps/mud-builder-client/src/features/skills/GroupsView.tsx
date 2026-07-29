import { useEffect, useMemo, useState } from 'react';
import {
  emitGroupsFile,
  parseGroupsFile,
  stockGroup,
  stockGroupsFile,
  groupMemberCandidates,
  resolveMember,
  validateGroups,
  MAX_IN_GROUP,
  type GroupEntry,
} from '@shatteredarchive/merc-area';

import { ApiError, api } from '../../api/client.js';
import { ConflictPanel, NumField } from '../areas/workbench.js';
import { Toast, type ToastState } from '../shared/Toast.js';
import '../areas/areas.css';

/**
 * Skill-groups editor (Phase 8) — edits groups.dat, the boot-time DATA
 * overlay onto the game's compiled group_table. Same contract as skills.dat:
 * one global optional file, applied at the next COPYOVER only.
 *
 * Group names are row identity and read-only (player files persist known
 * groups by name; character creation hardcodes the basics/default groups).
 * Ratings use the game's sentinel scheme: -1 = unavailable to that class,
 * 0 = free/auto (creation basics), 1+ = cost in creation points / trains.
 * Members resolve like the game's group_add — skill first, then group, by
 * case-insensitive prefix — and membership must stay acyclic (a cycle would
 * crash the game's recursive group_add at the first login that touches it).
 */
const CLASS_NAMES = ['Mage', 'Cleric', 'Thief', 'Warrior'];

export default function GroupsView({ writeEnabled }: { writeEnabled: boolean }) {
  const [groups, setGroups] = useState<GroupEntry[] | null>(null);
  const [source, setSource] = useState<'overlay' | 'stock'>('stock');
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const [newMember, setNewMember] = useState('');
  // Conditional-save identity (Phase 12): null = stock (no overlay on disk yet)
  const [baseHash, setBaseHash] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const load = () => {
    api
      .groups()
      .then((r) => {
        setGroups(r.groups);
        setSource(r.source);
        setBaseHash(r.baseHash);
        setConflict(false);
        if (r.parseError) setToast({ kind: 'err', text: `on-disk groups.dat is unreadable (${r.parseError}) — showing the compiled table` });
      })
      .catch((e) => setToast({ kind: 'err', text: `server unreachable: ${(e as Error).message}` }));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const model = useMemo(() => (groups ? { groups } : null), [groups]);
  const summary = useMemo(() => (model ? validateGroups(model) : { errors: [], warnings: [] }), [model]);
  const emitted = useMemo(() => {
    if (!model || summary.errors.length > 0) return null;
    try {
      return emitGroupsFile(model);
    } catch {
      return null;
    }
  }, [model, summary]);

  const group = groups?.find((g) => g.name === selected) ?? null;
  const stock = selected !== null ? stockGroup(selected) : undefined;
  const candidates = useMemo(() => groupMemberCandidates(), []);

  const update = (next: GroupEntry) => {
    if (!groups) return;
    setGroups(groups.map((g) => (g.name === next.name ? next : g)));
  };

  const save = async () => {
    if (!groups) return;
    try {
      const r = await api.saveGroups(groups, baseHash);
      setSource('overlay');
      setBaseHash(r.hash ?? null);
      setConflict(false);
      setToast({ kind: 'ok', text: `groups.dat saved — ${r.note}` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        return;
      }
      setToast({ kind: 'err', text: `save failed: ${(e as Error).message}` });
    }
  };

  const conflictSaveAnyway = async () => {
    if (!groups) return;
    if (!window.confirm('Overwrite the other save of groups.dat with yours? Theirs is backed up first.')) return;
    try {
      const r = await api.saveGroups(groups); // no baseHash = unconditional
      setSource('overlay');
      setBaseHash(r.hash ?? null);
      setConflict(false);
      setToast({ kind: 'ok', text: `groups.dat saved — ${r.note}` });
    } catch (e) {
      setToast({ kind: 'err', text: `save failed: ${(e as Error).message}` });
    }
  };

  const revert = async () => {
    if (!window.confirm('Remove groups.dat and return to the compiled stock table at the next copyover?')) return;
    try {
      await api.deleteGroups();
      setGroups(stockGroupsFile().groups);
      setSource('stock');
      setBaseHash(null);
      setToast({ kind: 'ok', text: 'overlay removed — the compiled table returns at the next copyover' });
    } catch (e) {
      setToast({ kind: 'err', text: `revert failed: ${(e as Error).message}` });
    }
  };

  const download = () => {
    if (!emitted) return;
    const url = URL.createObjectURL(new Blob([emitted], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'groups.dat';
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyManual = () => {
    try {
      const parsed = parseGroupsFile(manualText);
      const check = validateGroups(parsed);
      if (check.errors.length > 0) {
        setToast({ kind: 'err', text: `manual text invalid: ${check.errors[0]}` });
        return;
      }
      setGroups(parsed.groups);
      setManualOpen(false);
      setToast({ kind: 'ok', text: 'manual text applied to the forms' });
    } catch (e) {
      setToast({ kind: 'err', text: `manual text does not parse: ${(e as Error).message}` });
    }
  };

  const addMember = () => {
    if (!group || newMember === '') return;
    update({ ...group, members: [...group.members, newMember] });
    setNewMember('');
  };

  const shown = (groups ?? []).filter((g) => g.name.includes(filter.toLowerCase()));

  return (
    <>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <p className="mb-muted">
        Edits the game&apos;s skill GROUP data (groups.dat) — creation costs (customize), gain/train bundles and
        membership — currently showing the {source === 'overlay' ? 'authored overlay' : 'compiled stock table'}. Changes
        load at boot only: run a <strong>copyover</strong> to apply. Group names are compiled into the game and
        read-only. Ratings: -1 = not available to that class, 0 = free at creation, 1+ = cost.
      </p>

      {!groups && <p className="mb-muted">Loading…</p>}

      {groups && (
        <>
          {conflict && <ConflictPanel file="groups.dat" onReload={load} onSaveAnyway={conflictSaveAnyway} />}
          <div className="mb-entity-actions">
            <button type="button" onClick={save} disabled={!writeEnabled || summary.errors.length > 0}>
              Save groups.dat
            </button>
            <button type="button" onClick={download} disabled={!emitted}>
              Download
            </button>
            <button type="button" onClick={() => { setManualText(emitted ?? ''); setManualOpen(!manualOpen); }} disabled={!emitted && !manualOpen}>
              {manualOpen ? 'Close manual edit' : 'Manual edit'}
            </button>
            {source === 'overlay' && writeEnabled && (
              <button type="button" className="mb-danger" onClick={revert}>
                Remove overlay (revert to stock)
              </button>
            )}
            {!writeEnabled && <span className="mb-muted">writes disabled — preview/download only</span>}
          </div>

          {summary.errors.map((e) => (
            <p key={e} className="mb-world-error">
              {e}
            </p>
          ))}
          {summary.warnings.map((w) => (
            <p key={w} className="mb-warning">
              ⚠ {w}
            </p>
          ))}

          {manualOpen ? (
            <fieldset className="mb-fieldset">
              <legend>Manual edit — groups.dat (exact generated text)</legend>
              <textarea
                aria-label="groups.dat text"
                rows={24}
                style={{ width: '100%', fontFamily: 'monospace' }}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
              />
              <div className="mb-entity-actions">
                <button type="button" onClick={applyManual}>
                  Apply to forms
                </button>
              </div>
            </fieldset>
          ) : (
            <div className="mb-editor-split">
              <nav className="mb-room-list">
                <h4>Groups ({groups.length})</h4>
                <input aria-label="Filter groups" placeholder="filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                <ul>
                  {shown.map((g) => (
                    <li key={g.name}>
                      <button
                        type="button"
                        className={g.name === selected ? 'mb-active' : ''}
                        onClick={() => setSelected(g.name)}
                      >
                        {g.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>

              <section>
                {!group && <p className="mb-muted">Select a group to edit its ratings and members.</p>}
                {group && (
                  <fieldset className="mb-fieldset">
                    <legend>
                      {group.name}
                      {stock && <span className="mb-muted"> (compiled-in name)</span>}
                    </legend>

                    <div className="mb-form-grid">
                      {CLASS_NAMES.map((c, i) => (
                        <label key={c} className="mb-field">
                          <span>{c} available</span>
                          <input
                            aria-label={`${c} available`}
                            type="checkbox"
                            checked={group.ratings[i] !== -1}
                            onChange={(e) =>
                              update({ ...group, ratings: group.ratings.map((v, j) => (j === i ? (e.target.checked ? 0 : -1) : v)) })
                            }
                          />
                        </label>
                      ))}
                      {CLASS_NAMES.map((c, i) =>
                        group.ratings[i] !== -1 ? (
                          <NumField
                            key={c}
                            label={`${c} cost`}
                            value={group.ratings[i]}
                            onChange={(n) => update({ ...group, ratings: group.ratings.map((v, j) => (j === i ? n : v)) })}
                          />
                        ) : (
                          <label key={c} className="mb-field">
                            <span>{c} cost</span>
                            <span className="mb-muted">n/a</span>
                          </label>
                        ),
                      )}
                    </div>

                    <fieldset className="mb-fieldset">
                      <legend>
                        Members ({group.members.length}/{MAX_IN_GROUP})
                      </legend>
                      <ul className="mb-member-list">
                        {group.members.map((m, i) => {
                          const resolved = resolveMember(m);
                          return (
                            <li key={`${m}-${i}`}>
                              <span>
                                {m}
                                <span className="mb-muted">
                                  {' '}
                                  {resolved
                                    ? resolved.kind === 'group'
                                      ? `(group${resolved.name !== m ? `: ${resolved.name}` : ''})`
                                      : resolved.name !== m
                                        ? `(skill: ${resolved.name})`
                                        : '(skill)'
                                    : '(unresolved!)'}
                                </span>
                              </span>{' '}
                              <button
                                type="button"
                                aria-label={`Remove member ${m}`}
                                onClick={() => update({ ...group, members: group.members.filter((_, j) => j !== i) })}
                              >
                                remove
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      {group.members.length < MAX_IN_GROUP && (
                        <div className="mb-entity-actions">
                          <select aria-label="New member" value={newMember} onChange={(e) => setNewMember(e.target.value)}>
                            <option value="">— pick a skill or group —</option>
                            <optgroup label="Groups">
                              {candidates.groups
                                .filter((g) => g !== group.name)
                                .map((g) => (
                                  <option key={`g-${g}`} value={g}>
                                    {g}
                                  </option>
                                ))}
                            </optgroup>
                            <optgroup label="Skills & spells">
                              {candidates.skills.map((s) => (
                                <option key={`s-${s}`} value={s}>
                                  {s}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                          <button type="button" onClick={addMember} disabled={newMember === ''}>
                            Add member
                          </button>
                        </div>
                      )}
                    </fieldset>
                  </fieldset>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </>
  );
}
