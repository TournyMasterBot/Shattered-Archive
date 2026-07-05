import './App.css';

/**
 * Landing page for the Kingdom Tactics client.
 *
 * This is a scaffold placeholder so the app launches and renders something
 * while the real surfaces (arena board, army builder, simulator dashboard) are
 * built out. Intentionally self-contained — it does NOT import the engine at
 * runtime, so `pnpm dev:kingdom-tactics-client` works even before the engine's
 * `dist/` is built. Wire the engine in once the board/simulator features land.
 */

interface Surface {
  readonly title: string;
  readonly blurb: string;
  readonly status: 'planned' | 'in-progress' | 'ready';
}

const SURFACES: readonly Surface[] = [
  {
    title: 'Arena Board',
    blurb: 'Grid battlefield with terrain backdrop, tokens, movement + attack ranges.',
    status: 'planned',
  },
  {
    title: 'Army Builder',
    blurb: 'Pick races, classes, and formations; assemble a warband before a match.',
    status: 'planned',
  },
  {
    title: 'Local Play & Scenario',
    blurb: 'Hot-seat matches and single-controller scenarios over the deterministic engine.',
    status: 'planned',
  },
  {
    title: 'Simulator Dashboard',
    blurb: 'Run batch AI-vs-AI matches and read win-rate / turn stats for balance tuning.',
    status: 'planned',
  },
];

const STATUS_LABEL: Record<Surface['status'], string> = {
  planned: 'Planned',
  'in-progress': 'In progress',
  ready: 'Ready',
};

export function App() {
  return (
    <div className="kt-shell">
      <header className="kt-header">
        <p className="kt-eyebrow">Shattered Archive</p>
        <h1 className="kt-title">Kingdom&nbsp;Tactics</h1>
        <p className="kt-subtitle">
          A deterministic, grid-based tactics arena driven by a shared, isomorphic rules engine.
        </p>
        <p className="kt-engine-note">
          Engine: <code>@shatteredarchive/kingdom-tactics-engine</code> — Phase&nbsp;3
          (reducer&nbsp;+&nbsp;AI policies&nbsp;+&nbsp;simulators) in progress.
        </p>
      </header>

      <main className="kt-grid" aria-label="Client surfaces">
        {SURFACES.map((s) => (
          <section key={s.title} className="kt-card">
            <div className="kt-card-head">
              <h2 className="kt-card-title">{s.title}</h2>
              <span className={`kt-badge kt-badge--${s.status}`}>{STATUS_LABEL[s.status]}</span>
            </div>
            <p className="kt-card-blurb">{s.blurb}</p>
          </section>
        ))}
      </main>

      <footer className="kt-footer">
        <span>{import.meta.env.VITE_ENV ?? 'dev'} build</span>
        <span>·</span>
        <span>client scaffold — landing page</span>
      </footer>
    </div>
  );
}
