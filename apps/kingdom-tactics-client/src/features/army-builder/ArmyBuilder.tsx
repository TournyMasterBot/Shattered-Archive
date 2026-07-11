import { useMemo, useState } from 'react';
import {
  rosterCost,
  validateRoster,
  type ArmyRoster,
  type GameModeConfig,
  type GameModeId,
  type RaceClassContext,
  type TerrainChoice,
} from '@shatteredarchive/kingdom-tactics-engine';

import { providers } from '../../state/providers';
import { useNav } from '../../state/nav';
import {
  listSavedArmies,
  removeArmy,
  saveArmy,
  type ArmyPick,
} from '../../state/saved-armies';
import './ArmyBuilder.css';

/**
 * Army Builder — pick race×class units under a mode's deployment budget, then start a match.
 * Budget + validation come entirely from the engine (`rosterCost`, `validateRoster`); the client
 * only renders costs and gates the Add button.
 *
 * For 2-side modes the player can build BOTH sides (an "Edit army" toggle); a side left empty is
 * mirrored from side 0. 3–4-side FFA mirrors side 0 to every opponent. Armies can be saved by name
 * (localStorage) and loaded into the side being edited. Squadron/objective/horde modes stay disabled.
 */

type Pick = ArmyPick;

/** Modes the local loop can play to a decision: non-squadron rout modes, 2–4 sides (incl. FFA). */
const isEnabledMode = (m: GameModeConfig): boolean =>
  !m.usesSquadrons && m.victory === 'rout' && m.sides >= 2 && m.sides <= 4;

export function ArmyBuilderScreen() {
  const { navigate, startMatch } = useNav();

  const modes = providers.modes.modes();
  const classNameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of providers.data.classes()) map.set(c.key, c.name);
    return map;
  }, []);

  const [modeId, setModeId] = useState<GameModeId>('skirmish');
  const [raceKey, setRaceKey] = useState('Human');
  // Each team fights for ONE allegiance (clan/kingdom/faction, or loner/renegade), stored per side.
  // It gates that team's CSR reclass picks; empty = unaffiliated (no CSR with an allegiance gate).
  const [allegianceBySide, setAllegianceBySide] = useState<Record<number, string>>({});
  const [terrain, setTerrain] = useState<TerrainChoice>('flat');
  const [hotSeat, setHotSeat] = useState(false);
  const [editingSide, setEditingSide] = useState(0);
  const [picksBySide, setPicksBySide] = useState<Record<number, Pick[]>>({});
  const [armyName, setArmyName] = useState('');
  const [saved, setSaved] = useState(() => listSavedArmies());

  const mode = providers.modes.mode(modeId);
  const twoSided = mode.sides === 2;
  const side = twoSided ? editingSide : 0; // only 2-side modes expose per-side editing
  const picks = picksBySide[side] ?? [];
  const allegianceKey = allegianceBySide[side] ?? '';
  const setAllegianceKey = (value: string) =>
    setAllegianceBySide((prev) => ({ ...prev, [side]: value }));

  // The edited team's affiliation context, from its allegiance. Undefined when unaffiliated,
  // which gates out every CSR reclass that requires an allegiance (they won't appear in the palette).
  const ctx = useMemo<RaceClassContext | undefined>(
    () => (allegianceKey ? { allegianceKey } : undefined),
    [allegianceKey],
  );

  const roster: ArmyRoster = { side, name: 'roster', picks, context: ctx };
  const isUnitsBudget = mode.budgetKind === 'units';
  const spent = isUnitsBudget ? picks.length : rosterCost(roster, providers);
  const remaining = mode.budget - spent;
  const budgetLabel = isUnitsBudget ? 'units' : 'points';

  // Legality-filtered palette: only classes this race may legally be built as under the army's
  // affiliation (raceRestrictions FORBID, requiresRaces ALLOW, CSR affiliation gate). Each entry
  // carries the resolved tier cost, whether it's a reclass, its base-class group, and caster level.
  const palette = useMemo(() => {
    return providers.data.legalClassesForRace(raceKey, ctx).map((classKey) => {
      const t = providers.data.unitTemplate(raceKey, classKey);
      return {
        classKey,
        name: classNameOf.get(classKey) ?? classKey,
        cost: t.cost,
        isReclass: t.isReclass ?? false,
        classGroup: t.classGroup ?? classKey,
        castingLevel: t.castingLevel,
        damageBoostPct: t.damageBoostPct ?? 0,
      };
    });
  }, [raceKey, ctx, classNameOf]);

  type PaletteEntry = (typeof palette)[number];

  // Navigable tree grouped by BASE CLASS: each top-level node is a base class (itself pickable),
  // and the reclasses derived from it (same DSL classGroup) are its child items. Groups are sorted
  // alphabetically by base-class name, and the reclasses within each group are alphabetical too.
  const groups = useMemo(() => {
    const byGroup = new Map<string, { base?: PaletteEntry; reclasses: PaletteEntry[] }>();
    for (const u of palette) {
      const g = u.classGroup || u.classKey;
      const entry = byGroup.get(g) ?? { reclasses: [] };
      if (!u.isReclass && u.classKey === g) entry.base = u;
      else entry.reclasses.push(u);
      byGroup.set(g, entry);
    }
    return [...byGroup.entries()]
      .map(([groupKey, v]) => ({
        groupKey,
        label: classNameOf.get(groupKey) ?? groupKey,
        base: v.base,
        reclasses: [...v.reclasses].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [palette, classNameOf]);

  // Groups default to open; a groupKey present with `false` is collapsed.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (key: string) => setOpenGroups((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  const castBadge = (castingLevel?: number) =>
    castingLevel === undefined ? null : (
      <span className="kt-cast-badge" title="Effective caster level (level cap × cast factor + elf)">
        ⚡{castingLevel}
      </span>
    );
  const boostBadge = (pct?: number) =>
    !pct ? null : (
      <span
        className={`kt-boost-badge ${pct > 0 ? 'kt-boost-badge--up' : 'kt-boost-badge--down'}`}
        title={`Race damage ${pct > 0 ? 'boost' : 'gimp'} for this class`}
      >
        {pct > 0 ? `+${pct}%` : `${pct}%`} dmg
      </span>
    );

  const costOf = (p: Pick): number => providers.data.unitTemplate(p.raceKey, p.classKey).cost;
  const canAdd = (cost: number): boolean =>
    isUnitsBudget ? picks.length < mode.budget : spent + cost <= mode.budget;

  const setSidePicks = (updater: (cur: Pick[]) => Pick[]) =>
    setPicksBySide((prev) => ({ ...prev, [side]: updater(prev[side] ?? []) }));
  const add = (classKey: string) => setSidePicks((cur) => [...cur, { raceKey, classKey }]);
  const remove = (index: number) => setSidePicks((cur) => cur.filter((_, i) => i !== index));

  // Each team's allegiance context; a side with none mirrors side 0 (like its picks).
  const ctxForSide = (s: number): RaceClassContext | undefined => {
    const a = allegianceBySide[s] || allegianceBySide[0] || '';
    return a ? { allegianceKey: a } : undefined;
  };

  const side0Valid =
    (picksBySide[0]?.length ?? 0) > 0 &&
    validateRoster({ side: 0, picks: picksBySide[0] ?? [], context: ctxForSide(0) }, mode, providers).ok;

  const start = () => {
    if (!side0Valid) return;
    const rosters: ArmyRoster[] = Array.from({ length: mode.sides }, (_, s) => {
      const own = picksBySide[s];
      const effective = own && own.length > 0 ? own : (picksBySide[0] ?? []); // empty side mirrors side 0
      return { side: s, name: s === 0 ? 'You' : `Opponent ${s}`, picks: effective, context: ctxForSide(s) };
    });
    startMatch({ modeId, rosters, seed: 1, terrain, hotSeat: twoSided && hotSeat });
  };

  const doSave = () => setSaved(saveArmy(armyName, picks));
  const doLoad = (name: string) => {
    const army = saved.find((a) => a.name === name);
    if (army) setSidePicks(() => army.picks.map((p) => ({ ...p })));
  };
  const doDelete = (name: string) => setSaved(removeArmy(name));

  const panelTitle = side === 0 ? 'Your army' : 'Opponent army';

  return (
    <div className="kt-builder">
      <header className="kt-builder-head">
        <h1 className="kt-title">Army Builder</h1>
        <button type="button" className="kt-btn kt-btn--ghost" onClick={() => navigate('menu')}>
          Back to menu
        </button>
      </header>

      <div className="kt-builder-controls">
        <label>
          Mode{' '}
          <select
            aria-label="Mode"
            value={modeId}
            onChange={(e) => setModeId(e.target.value as GameModeId)}
          >
            {modes.map((m) => (
              <option key={m.id} value={m.id} disabled={!isEnabledMode(m)}>
                {m.name}
                {isEnabledMode(m) ? '' : ' (Part C)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Race{' '}
          <select aria-label="Race" value={raceKey} onChange={(e) => setRaceKey(e.target.value)}>
            {providers.data.races().map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Allegiance{' '}
          <select
            aria-label="Allegiance"
            value={allegianceKey}
            onChange={(e) => setAllegianceKey(e.target.value)}
          >
            <option value="">Unaffiliated</option>
            {providers.data
              .affiliations()
              .filter((a) => a.kind !== 'remort')
              .map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Map{' '}
          <select
            aria-label="Map"
            value={terrain}
            onChange={(e) => setTerrain(e.target.value as TerrainChoice)}
          >
            <option value="flat">Flat</option>
            <option value="authored">Authored ({mode.terrainProfile})</option>
          </select>
        </label>
        {twoSided && (
          <label className="kt-hotseat">
            <input
              type="checkbox"
              checked={hotSeat}
              onChange={(e) => setHotSeat(e.target.checked)}
            />{' '}
            Hot-seat
          </label>
        )}
        <span className="kt-budget" aria-label="Remaining budget">
          Remaining: {remaining} {budgetLabel}
        </span>
      </div>

      {twoSided && (
        <div className="kt-side-toggle" role="group" aria-label="Edit army">
          <span>Edit army:</span>
          <button
            type="button"
            className={`kt-btn kt-btn--sm ${editingSide === 0 ? 'kt-btn--primary' : ''}`}
            aria-pressed={editingSide === 0}
            onClick={() => setEditingSide(0)}
          >
            You ({picksBySide[0]?.length ?? 0})
          </button>
          <button
            type="button"
            className={`kt-btn kt-btn--sm ${editingSide === 1 ? 'kt-btn--primary' : ''}`}
            aria-pressed={editingSide === 1}
            onClick={() => setEditingSide(1)}
          >
            Opponent ({picksBySide[1]?.length ?? 0})
          </button>
        </div>
      )}

      <div className="kt-builder-body">
        <section className="kt-palette" aria-label="Unit palette">
          <h2 className="kt-panel-title">Units</h2>
          <div className="kt-tree" role="tree" aria-label="Classes by base class">
            {groups.map((grp) => {
              const open = openGroups[grp.groupKey] ?? true;
              const hasChildren = grp.reclasses.length > 0;
              return (
                <div className="kt-tree-group" key={grp.groupKey} role="treeitem" aria-expanded={open}>
                  <div className="kt-tree-head">
                    <button
                      type="button"
                      className="kt-tree-toggle"
                      aria-expanded={open}
                      aria-label={`${open ? 'Collapse' : 'Expand'} ${grp.label}`}
                      onClick={() => toggleGroup(grp.groupKey)}
                      disabled={!hasChildren}
                    >
                      <span className="kt-tree-caret" aria-hidden="true">
                        {hasChildren ? (open ? '▾' : '▸') : '·'}
                      </span>
                    </button>
                    {grp.base ? (
                      <>
                        <span className="kt-unit-label kt-tree-base">
                          {grp.base.name} · {grp.base.cost} pts
                        </span>
                        {boostBadge(grp.base.damageBoostPct)}
                        {castBadge(grp.base.castingLevel)}
                        <button
                          type="button"
                          className="kt-btn kt-btn--sm"
                          aria-label={`Add ${grp.base.name}`}
                          disabled={!canAdd(grp.base.cost)}
                          onClick={() => add(grp.base!.classKey)}
                        >
                          Add
                        </button>
                      </>
                    ) : (
                      <span className="kt-unit-label kt-tree-base kt-tree-base--locked">
                        {grp.label} <span className="kt-muted">(base unavailable for this race)</span>
                      </span>
                    )}
                  </div>
                  {open && hasChildren && (
                    <ul className="kt-tree-children" role="group">
                      {grp.reclasses.map((u) => (
                        <li key={u.classKey} className="kt-tree-row" role="treeitem">
                          <span className="kt-unit-label">
                            {u.name} · {u.cost} pts
                          </span>
                          {boostBadge(u.damageBoostPct)}
                          {castBadge(u.castingLevel)}
                          <button
                            type="button"
                            className="kt-btn kt-btn--sm"
                            aria-label={`Add ${u.name}`}
                            disabled={!canAdd(u.cost)}
                            onClick={() => add(u.classKey)}
                          >
                            Add
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="kt-roster" aria-label="Army roster">
          <h2 className="kt-panel-title">
            {panelTitle} ({picks.length})
          </h2>
          {picks.length === 0 ? (
            <p className="kt-empty">No units yet — add some from the palette.</p>
          ) : (
            <ul>
              {picks.map((p, i) => (
                <li key={`${p.raceKey}:${p.classKey}:${i}`} className="kt-roster-row">
                  <span className="kt-unit-label">
                    {classNameOf.get(p.classKey) ?? p.classKey} · {costOf(p)} pts
                  </span>
                  <button
                    type="button"
                    className="kt-btn kt-btn--sm"
                    aria-label={`Remove ${classNameOf.get(p.classKey) ?? p.classKey}`}
                    onClick={() => remove(i)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="kt-save-row">
            <input
              aria-label="Army name"
              placeholder="Army name"
              value={armyName}
              onChange={(e) => setArmyName(e.target.value)}
            />
            <button
              type="button"
              className="kt-btn kt-btn--sm"
              disabled={picks.length === 0 || armyName.trim() === ''}
              onClick={doSave}
            >
              Save army
            </button>
          </div>

          <button
            type="button"
            className="kt-btn kt-btn--primary"
            disabled={!side0Valid}
            onClick={start}
          >
            Start Match
          </button>
        </section>
      </div>

      {saved.length > 0 && (
        <section className="kt-saved" aria-label="Saved armies">
          <h2 className="kt-panel-title">Saved armies</h2>
          <ul>
            {saved.map((a) => (
              <li key={a.name} className="kt-saved-row">
                <span className="kt-unit-label">
                  {a.name} · {a.picks.length} units
                </span>
                <button
                  type="button"
                  className="kt-btn kt-btn--sm"
                  aria-label={`Load ${a.name}`}
                  onClick={() => doLoad(a.name)}
                >
                  Load
                </button>
                <button
                  type="button"
                  className="kt-btn kt-btn--sm"
                  aria-label={`Delete ${a.name}`}
                  onClick={() => doDelete(a.name)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
