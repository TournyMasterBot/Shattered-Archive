import { useState } from 'react';

import { findRole } from '../../domain/roleCatalog.js';
import { isUmbraseerBlocked, UMBRASEER_BLOCKED_MESSAGE } from '../../domain/umbraseerBlock.js';
import type { RoomAction } from '../../domain/gameReducer.js';
import type { Alignment, Player, RoomState, TimelineEntry } from '../../domain/types.js';

interface NightActionLogProps {
  room: RoomState;
  dispatch: (action: RoomAction) => void;
}

function playerName(room: RoomState, id: string | null | undefined): string {
  if (!id) return 'no one';
  return room.players.find((p) => p.id === id)?.name ?? 'unknown player';
}

function NightActionRow({
  title,
  actorName,
  candidates,
  recordedText,
  onConfirm,
}: {
  title: string;
  actorName: string;
  candidates: Player[];
  recordedText: string | null;
  onConfirm: (targetId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState('');

  if (recordedText && !editing) {
    return (
      <div className="ss-night-action-row">
        <h3>{title}</h3>
        <p>{recordedText}</p>
        <button type="button" onClick={() => setEditing(true)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="ss-night-action-row">
      <h3>{title}</h3>
      <p className="ss-night-action-actor">{actorName}</p>
      <select aria-label={title} value={selected} onChange={(e) => setSelected(e.target.value)}>
        <option value="">Choose a target…</option>
        {candidates.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selected}
        onClick={() => {
          onConfirm(selected);
          setEditing(false);
          setSelected('');
        }}
      >
        Confirm
      </button>
    </div>
  );
}

/**
 * Once-per-night entry forms for the built-in night roles. Scoped to the rules' three built-in
 * night actions (Umbraseer/Darkshield/Assassins) — custom/modifier roles are tracked on the
 * roster (Step 5's settings dialog) but don't get bespoke automated night-action UI here; any
 * effect they have is the Herald's manual call, per the MVP plan's Constraints.
 */
export default function NightActionLog({ room, dispatch }: NightActionLogProps) {
  if (room.phase !== 'night') return null;

  const day = room.dayNumber;
  const alive = room.players.filter((p) => p.alive);
  const umbraseer = alive.find((p) => p.roleId === 'umbraseer');
  const darkshield = alive.find((p) => p.roleId === 'darkshield');
  const hasAssassins = alive.some((p) => p.roleId === 'cultist-assassin');

  const checkEntry = room.timeline.find((e) => e.kind === 'night-check' && e.day === day) as
    | Extract<TimelineEntry, { kind: 'night-check' }>
    | undefined;
  const protectEntry = room.timeline.find((e) => e.kind === 'night-protect' && e.day === day) as
    | Extract<TimelineEntry, { kind: 'night-protect' }>
    | undefined;
  const targetEntry = room.timeline.find((e) => e.kind === 'night-assassin-target' && e.day === day) as
    | Extract<TimelineEntry, { kind: 'night-assassin-target' }>
    | undefined;

  return (
    <section className="ss-night-log" aria-label="Night actions">
      <h2>Night {day} actions</h2>

      {!umbraseer && !darkshield && !hasAssassins && <p>No living special roles to act tonight.</p>}

      {umbraseer && (
        <NightActionRow
          title="Umbraseer's check"
          actorName={umbraseer.name}
          candidates={alive.filter((p) => p.id !== umbraseer.id)}
          recordedText={
            checkEntry
              ? isUmbraseerBlocked(room, day)
                ? `${playerName(room, checkEntry.targetId)}: ${UMBRASEER_BLOCKED_MESSAGE} (actually ${checkEntry.roleName})`
                : `${playerName(room, checkEntry.targetId)}: ${checkEntry.roleName}`
              : null
          }
          onConfirm={(targetId) => {
            const target = room.players.find((p) => p.id === targetId);
            // The target's OWN role, not `countsTowardAlignment`'s win-tally-gated check — that
            // helper answers a different question (does this role count toward the automatic win
            // tally), and using it here silently misdetected any custom role that opted out of
            // the tally (or any custom "neutral" role, collapsed into "not an Assassin"/"Dark
            // Knight" instead of its real alignment). This works for any role, built-in or
            // custom, regardless of its win-tally flag. A successful check reveals the target's
            // actual role (not just an assassin/not-assassin binary), so both the alignment and
            // the role's name are recorded.
            const role = findRole(room.roles, target?.roleId);
            const result: Alignment = role?.alignment ?? 'darkKnight';
            const roleName = role?.name ?? 'Dark Knight';
            dispatch({ type: 'recordNightCheck', checkerId: umbraseer.id, targetId, result, roleName });
          }}
        />
      )}

      {darkshield && (
        <NightActionRow
          title="Darkshield's protection"
          actorName={darkshield.name}
          candidates={alive}
          recordedText={protectEntry ? `Protecting ${playerName(room, protectEntry.targetId)}` : null}
          onConfirm={(targetId) => dispatch({ type: 'recordNightProtect', protectorId: darkshield.id, targetId })}
        />
      )}

      {hasAssassins && (
        <NightActionRow
          title="Assassins' target"
          actorName="Consensus target"
          candidates={alive.filter((p) => p.roleId !== 'cultist-assassin')}
          recordedText={targetEntry ? `Target: ${playerName(room, targetEntry.targetId)}` : null}
          onConfirm={(targetId) => dispatch({ type: 'recordAssassinTarget', targetId })}
        />
      )}
    </section>
  );
}
