import { useMemo, useState } from 'react';
import {
  stanceMod,
  stancesForClass,
  type Action,
  type BoardToken,
  type MatchState,
  type MoveAction,
  type AttackAction,
  type Side,
} from '@shatteredarchive/kingdom-tactics-engine';

import './Arena.css';

/**
 * Grid battlefield renderer + click interaction. Pure presentation over a `MatchState`: it
 * asks the engine (via `legalActionsFor`) what a selected token may do and reports the chosen
 * `Action` through `onAct` — it never computes rules itself.
 *
 * Interaction (only when it's the controllable side's turn): click a friendly token to select
 * it → legal move tiles highlight and attackable enemies are marked → click a highlight to
 * move, or a marked enemy to attack. An "End turn" control ends the side's turn.
 */
export interface ArenaProps {
  readonly state: MatchState;
  /** The side the local human controls; interaction is enabled only while it is active. */
  readonly controllableSide: Side;
  readonly legalActionsFor: (tokenId: string) => Action[];
  readonly onAct: (action: Action) => void;
  /** Default true; when false the board is display-only (no selection/acting). */
  readonly interactive?: boolean;
}

const coordKey = (x: number, y: number): string => `${x},${y}`;
const isLiving = (t: BoardToken): boolean => (t.kind === 'unit' ? t.hp > 0 : t.hpPool > 0);
const tokenHp = (t: BoardToken): number => (t.kind === 'unit' ? t.hp : t.hpPool);

export function Arena({
  state,
  controllableSide,
  legalActionsFor,
  onAct,
  interactive = true,
}: ArenaProps) {
  const { board } = state;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canControl =
    interactive && state.status === 'in-progress' && state.activeSide === controllableSide;

  // One-unit-per-turn: once the active side activates a unit, only it may be controlled.
  const activatedId = state.activatedTokenId;
  const isControllable = (tokenId: string): boolean =>
    activatedId === undefined || tokenId === activatedId;

  // Living token at each occupied cell, for O(1) lookup while rendering.
  const tokenAt = useMemo(() => {
    const map = new Map<string, BoardToken>();
    for (const t of state.tokens) if (isLiving(t)) map.set(coordKey(t.pos.x, t.pos.y), t);
    return map;
  }, [state.tokens]);

  // Highlights derived from the selected token's legal actions.
  const { moveTargets, attackTargets } = useMemo(() => {
    const moves = new Map<string, MoveAction>();
    const attacks = new Map<string, AttackAction>();
    if (selectedId && canControl) {
      for (const a of legalActionsFor(selectedId)) {
        if (a.type === 'move') moves.set(coordKey(a.to.x, a.to.y), a);
        else if (a.type === 'attack') attacks.set(a.targetId, a);
      }
    }
    return { moveTargets: moves, attackTargets: attacks };
  }, [selectedId, canControl, legalActionsFor]);

  function handleCell(x: number, y: number): void {
    const key = coordKey(x, y);
    const token = tokenAt.get(key);

    if (token) {
      const attack = attackTargets.get(token.instanceId);
      if (attack) {
        onAct(attack);
        setSelectedId(null);
        return;
      }
      if (canControl && token.side === controllableSide && isControllable(token.instanceId)) {
        setSelectedId((cur) => (cur === token.instanceId ? null : token.instanceId));
        return;
      }
      setSelectedId(null);
      return;
    }

    const move = moveTargets.get(key);
    if (move) {
      onAct(move);
      setSelectedId(null);
      return;
    }
    setSelectedId(null);
  }

  // The selected friendly UNIT (if any) whose stance the player may change. Stance-setting is a
  // free minor action — allowed on any own unit on your turn — so it stays available even after
  // the unit has moved/attacked; selection just needs to be the controllable side's own unit.
  const selectedUnit = useMemo(() => {
    if (!selectedId || !canControl) return undefined;
    const t = state.tokens.find((tk) => tk.instanceId === selectedId);
    return t && t.kind === 'unit' && t.side === controllableSide ? t : undefined;
  }, [selectedId, canControl, state.tokens, controllableSide]);

  const stanceOptions = selectedUnit
    ? stancesForClass(selectedUnit.templateId.split(':')[1] ?? '')
    : [];
  const currentStance = selectedUnit ? stanceMod(selectedUnit.stance).key : 'normal';

  return (
    <div className="kt-arena">
      <div
        className="kt-board"
        role="grid"
        aria-label={`Battlefield ${board.width} by ${board.height}`}
        style={{ gridTemplateColumns: `repeat(${board.width}, var(--kt-cell, 2.25rem))` }}
      >
        {board.tiles.map((row, y) =>
          row.map((tile, x) => {
            const key = coordKey(x, y);
            const token = tokenAt.get(key);
            const isMove = moveTargets.has(key);
            const isAttack = token ? attackTargets.has(token.instanceId) : false;
            const isSelected = token?.instanceId === selectedId;
            const isActivated = token !== undefined && token.instanceId === activatedId;
            const cls = [
              'kt-cell',
              `kt-terrain--${tile.terrain.toLowerCase()}`,
              isMove ? 'kt-cell--move' : '',
              isAttack ? 'kt-cell--attack' : '',
              isSelected ? 'kt-cell--selected' : '',
              isActivated ? 'kt-cell--activated' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const stanceLabel =
              token && token.kind === 'unit' ? `, ${stanceMod(token.stance).name} stance` : '';
            const label = token
              ? `${tile.terrain} (${x},${y}) — side ${token.side} unit, ${tokenHp(token)} hp${stanceLabel}`
              : `${tile.terrain} (${x},${y})`;
            return (
              <button
                type="button"
                key={key}
                className={cls}
                role="gridcell"
                aria-label={label}
                onClick={() => handleCell(x, y)}
              >
                {token && (
                  <span className={`kt-token kt-token--side${token.side}`} aria-hidden="true">
                    {tokenHp(token)}
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>

      {canControl && selectedUnit && (
        <div className="kt-stance-panel" role="group" aria-label="Unit stance">
          <span className="kt-stance-label">
            Stance: {stanceMod(selectedUnit.stance).name}
          </span>
          <div className="kt-stance-buttons">
            {stanceOptions.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`kt-btn kt-btn--sm ${s.key === currentStance ? 'kt-btn--primary' : ''}`}
                aria-pressed={s.key === currentStance}
                aria-label={`Set stance ${s.name}`}
                title={s.note}
                disabled={s.key === currentStance}
                onClick={() => onAct({ type: 'set-stance', tokenId: selectedUnit.instanceId, stance: s.key })}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {canControl && (
        <div className="kt-arena-controls">
          <button
            type="button"
            className="kt-btn"
            onClick={() => {
              onAct({ type: 'end-turn', side: controllableSide });
              setSelectedId(null);
            }}
          >
            End turn
          </button>
        </div>
      )}
    </div>
  );
}
