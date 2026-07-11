import { useMemo, useState } from 'react';
import type { GameModeConfig, GameModeId } from '@shatteredarchive/kingdom-tactics-engine';

import { useNav } from '../../state/nav';
import { providers } from '../../state/providers';
import { useSimBatch } from './hooks/useSimBatch';
import type { PolicyKind, SimConfig } from './sim-runner';
import './SimulatorScreen.css';

/**
 * Simulator Dashboard (Phase 6) — configure a headless AI-vs-AI batch (mode, a Greedy/Random
 * policy per side, match count, base seed), Run it over the engine simulators via {@link useSimBatch},
 * and read the balance metrics: per-side win-rate (accessible CSS bars), draws, turn-limit hits,
 * average turns, plus a sample results table. The client configures + renders only; all match
 * logic and aggregation are the engine's.
 */

/** Modes the batch runner can play to a decision: non-squadron rout modes, 2–4 sides (mirrors the builder). */
const isEnabledMode = (m: GameModeConfig): boolean =>
  !m.usesSquadrons && m.victory === 'rout' && m.sides >= 2 && m.sides <= 4;

export const MAX_MATCHES = 500;
/** Clamp the requested match count to the v1 range [1, 500] (guards against a runaway batch). */
export const clampMatches = (n: number): number =>
  Number.isFinite(n) ? Math.min(MAX_MATCHES, Math.max(1, Math.floor(n))) : 1;

const SIDE_LABELS = ['Side 0', 'Side 1', 'Side 2', 'Side 3'];

export function SimulatorScreen() {
  const { navigate } = useNav();
  const modes = providers.modes.modes();

  const [modeId, setModeId] = useState<GameModeId>('skirmish');
  const [policyBySide, setPolicyBySide] = useState<Record<number, PolicyKind>>({});
  const [matches, setMatches] = useState(20);
  const [baseSeed, setBaseSeed] = useState(1);

  const { run, running, progress, result } = useSimBatch();

  const mode = providers.modes.mode(modeId);
  const sides = mode.sides;
  const policyFor = (s: number): PolicyKind => policyBySide[s] ?? 'greedy';

  const sideIndexes = useMemo(() => Array.from({ length: sides }, (_, s) => s), [sides]);

  const onRun = (): void => {
    const filled: Record<number, PolicyKind> = {};
    for (const s of sideIndexes) filled[s] = policyFor(s);
    const config: SimConfig = { modeId, policyBySide: filled, matches: clampMatches(matches), baseSeed };
    run(config);
  };

  return (
    <div className="kt-sim">
      <header className="kt-sim-head">
        <h1 className="kt-title">Simulator Dashboard</h1>
        <button type="button" className="kt-btn kt-btn--ghost" onClick={() => navigate('menu')}>
          Back to menu
        </button>
      </header>

      <section className="kt-sim-config" aria-label="Batch configuration">
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
                {isEnabledMode(m) ? '' : ' (unsupported)'}
              </option>
            ))}
          </select>
        </label>

        <div className="kt-sim-policies" role="group" aria-label="Side policies">
          {sideIndexes.map((s) => (
            <label key={s}>
              {SIDE_LABELS[s]}{' '}
              <select
                aria-label={`${SIDE_LABELS[s]} policy`}
                value={policyFor(s)}
                onChange={(e) =>
                  setPolicyBySide((prev) => ({ ...prev, [s]: e.target.value as PolicyKind }))
                }
              >
                <option value="greedy">Greedy</option>
                <option value="random">Random</option>
              </select>
            </label>
          ))}
        </div>

        <label>
          Matches{' '}
          <input
            type="number"
            aria-label="Matches"
            min={1}
            max={MAX_MATCHES}
            value={matches}
            onChange={(e) => setMatches(Number(e.target.value))}
          />
        </label>
        <label>
          Base seed{' '}
          <input
            type="number"
            aria-label="Base seed"
            value={baseSeed}
            onChange={(e) => setBaseSeed(Math.floor(Number(e.target.value)) || 0)}
          />
        </label>

        <button type="button" className="kt-btn kt-btn--primary" disabled={running} onClick={onRun}>
          {running ? 'Running…' : 'Run'}
        </button>
        {running && (
          <span className="kt-sim-progress" role="status">
            {progress}/{clampMatches(matches)} matches
          </span>
        )}
      </section>

      {result && (
        <section className="kt-sim-results" aria-label="Batch results">
          <h2 className="kt-panel-title">Results — {result.matches} matches</h2>

          <div className="kt-sim-bars">
            {sideIndexes.map((s) => {
              const wins = result.winsBySide[s] ?? 0;
              const pct = result.matches > 0 ? (wins / result.matches) * 100 : 0;
              return (
                <div className="kt-sim-bar-row" key={s}>
                  <span className="kt-sim-bar-label">{SIDE_LABELS[s]}</span>
                  <span
                    className="kt-sim-bar-track"
                    role="img"
                    aria-label={`${SIDE_LABELS[s]} win rate ${pct.toFixed(1)} percent, ${wins} of ${result.matches}`}
                  >
                    <span className={`kt-sim-bar-fill kt-sim-bar-fill--s${s}`} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="kt-sim-bar-value">
                    {pct.toFixed(1)}% ({wins}/{result.matches})
                  </span>
                </div>
              );
            })}
          </div>

          <dl className="kt-sim-stats">
            <div>
              <dt>Draws</dt>
              <dd>{result.draws}</dd>
            </div>
            <div>
              <dt>Turn-limit hits</dt>
              <dd>{result.turnLimitHits}</dd>
            </div>
            <div>
              <dt>Avg turns</dt>
              <dd>{result.avgTurns.toFixed(1)}</dd>
            </div>
          </dl>

          <table className="kt-sim-table">
            <caption>First {Math.min(20, result.results.length)} matches</caption>
            <thead>
              <tr>
                <th scope="col">Seed</th>
                <th scope="col">Winner</th>
                <th scope="col">Turns</th>
                <th scope="col">Survivors</th>
              </tr>
            </thead>
            <tbody>
              {result.results.slice(0, 20).map((r) => (
                <tr key={r.seed}>
                  <td>{r.seed}</td>
                  <td>{String(r.winner)}</td>
                  <td>{r.turns}</td>
                  <td>
                    {Object.entries(r.survivors)
                      .map(([side, n]) => `${side}:${n}`)
                      .join(' ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
