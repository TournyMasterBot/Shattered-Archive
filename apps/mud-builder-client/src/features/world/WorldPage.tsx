import { useEffect, useState } from 'react';

import { api, type ExternalRef, type WorldAreaSummary } from '../../api/client.js';
import '../areas/areas.css';

/**
 * Read-only world overview: one table row per area.lst entry with its vnum
 * range, entity counts, real reference warnings (vnums no listed area defines,
 * exit keys) and resolved cross-area links (navigable when the host app passes
 * onOpenArea). All editing happens on the other tabs.
 */
export default function WorldPage({ onOpenArea }: { onOpenArea?: (ref: ExternalRef) => void } = {}) {
  const [areas, setAreas] = useState<WorldAreaSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .world()
      .then((r) => setAreas(r.areas))
      .catch((e) => setError((e as Error).message));
  }, []);

  const totals = (areas ?? []).reduce(
    (t, a) => ({
      rooms: t.rooms + a.counts.rooms,
      mobs: t.mobs + a.counts.mobs,
      objects: t.objects + a.counts.objects,
      warnings: t.warnings + a.warnings.length,
      external: t.external + (a.external?.length ?? 0),
      errors: t.errors + a.errors.length + (a.parseError ? 1 : 0),
      pressure: t.pressure + (a.limitPressure?.length ?? 0),
    }),
    { rooms: 0, mobs: 0, objects: 0, warnings: 0, external: 0, errors: 0, pressure: 0 },
  );

  return (
    <div className="mb-areas">
      <main className="mb-area-main mb-world">
        <h3>World overview</h3>
        {error && <p className="mb-toast mb-toast--err">{error}</p>}
        {!areas && !error && <p className="mb-muted">Loading…</p>}

        {areas && (
          <>
            <p className="mb-muted">
              {areas.length} areas · {totals.rooms} rooms · {totals.mobs} mobs · {totals.objects} objects ·{' '}
              {totals.warnings} invalid refs · {totals.pressure} limit flags · {totals.external} resolved cross-area
              links · {totals.errors} errors
            </p>
            <div className="mb-world-table-wrap">
              <table className="mb-world-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Name</th>
                    <th>Vnums</th>
                    <th>Rooms</th>
                    <th>Mobs</th>
                    <th>Objects</th>
                    <th>Resets</th>
                    <th>Shops</th>
                    <th>Specials</th>
                    <th>Scripts</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {areas.map((a) => {
                    const external = a.external ?? [];
                    const pressure = a.limitPressure ?? [];
                    const issueCount =
                      a.errors.length + a.warnings.length + external.length + pressure.length + (a.parseError ? 1 : 0);
                    return (
                      <tr key={a.file} className={a.parseError || a.errors.length > 0 ? 'mb-world-row--bad' : ''}>
                        <td>{a.file}</td>
                        <td>{a.name ?? <span className="mb-muted">—</span>}</td>
                        <td>
                          {a.minVnum !== undefined && !(a.minVnum === 0 && a.maxVnum === 0)
                            ? `${a.minVnum}-${a.maxVnum}`
                            : '—'}
                        </td>
                        <td>{a.counts.rooms}</td>
                        <td>{a.counts.mobs}</td>
                        <td>{a.counts.objects}</td>
                        <td>{a.counts.resets}</td>
                        <td>{a.counts.shops}</td>
                        <td>{a.counts.specials}</td>
                        <td>{a.counts.scripts}</td>
                        <td>
                          {issueCount === 0 ? (
                            <span className="mb-muted">none</span>
                          ) : (
                            <details>
                              <summary>
                                {a.errors.length + (a.parseError ? 1 : 0) > 0
                                  ? `${a.errors.length + (a.parseError ? 1 : 0)} errors, `
                                  : ''}
                                {a.warnings.length} invalid
                                {pressure.length > 0 ? `, ${pressure.length} limit flags` : ''}
                                {external.length > 0 ? `, ${external.length} links` : ''}
                              </summary>
                              <ul className="mb-world-issues">
                                {a.parseError && <li className="mb-world-error">parse: {a.parseError}</li>}
                                {a.errors.map((e, i) => (
                                  <li key={`e${i}`} className="mb-world-error">
                                    {e}
                                  </li>
                                ))}
                                {a.warnings.map((w, i) => (
                                  <li key={`w${i}`} className="mb-world-invalid">
                                    ✖ INVALID: {w} — the whole world was searched; this vnum does not exist anywhere
                                  </li>
                                ))}
                                {pressure.map((p, i) => (
                                  <li key={`p${i}`} className="mb-world-limit">
                                    ⚖ {p.kind} #{p.vnum} {p.name}: {p.demand} resets spawn it but its tightest limit
                                    is {p.limit} — once {p.limit} exist, further resets mostly skip (item drifts
                                    toward inaccessible)
                                  </li>
                                ))}
                                {external.map((r, i) => (
                                  <li key={`x${i}`} title={r.where}>
                                    {onOpenArea ? (
                                      <button type="button" className="mb-ref-link" onClick={() => onOpenArea(r)}>
                                        → {r.kind} #{r.vnum} — {r.name} ({r.file})
                                      </button>
                                    ) : (
                                      <span>
                                        → {r.kind} #{r.vnum} — {r.name} ({r.file})
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
