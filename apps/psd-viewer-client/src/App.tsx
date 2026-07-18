import { useEffect, useRef, useState } from 'react';

interface Preset {
  name: string;
  path: string;
}

interface Loaded {
  url: string; // object URL for the decoded PNG
  fileName: string; // suggested download name, e.g. "Princess.png"
  width: number;
  height: number;
  bytes: number;
  decodeMs: number;
}

export default function App() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [pathInput, setPathInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // Revoke the previous object URL when it changes / on unmount to avoid leaks.
  const lastUrl = useRef<string | null>(null);
  useEffect(() => {
    lastUrl.current = loaded?.url ?? null;
    return () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    };
  }, [loaded]);

  useEffect(() => {
    fetch('/api/presets')
      .then((r) => r.json())
      .then((d: { presets: Preset[] }) => setPresets(d.presets ?? []))
      .catch(() => setPresets([]));
  }, []);

  async function open(filePath: string) {
    const target = filePath.trim();
    if (!target) return;
    setPathInput(target);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/psd/png?path=${encodeURIComponent(target)}`);
      if (!res.ok) {
        let msg = `Server returned ${res.status}`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const fileName =
        (target.split(/[\\/]/).pop() || 'image').replace(/\.psd$/i, '') + '.png';

      setLoaded({
        url,
        fileName,
        width: Number(res.headers.get('X-Psd-Width')) || 0,
        height: Number(res.headers.get('X-Psd-Height')) || 0,
        bytes: blob.size,
        decodeMs: Number(res.headers.get('X-Decode-Ms')) || 0,
      });
    } catch (e) {
      setLoaded(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function savePng() {
    if (!loaded) return;
    const a = document.createElement('a');
    a.href = loaded.url;
    a.download = loaded.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="app">
      <header>
        <h1>PSD Viewer</h1>
        <p className="sub">Open a Photoshop <code>.psd</code>, view its composite, save it as PNG.</p>
      </header>

      <section className="controls">
        <form
          className="open-row"
          onSubmit={(e) => {
            e.preventDefault();
            void open(pathInput);
          }}
        >
          <input
            type="text"
            placeholder="C:\path\to\file.psd"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            spellCheck={false}
          />
          <button type="submit" disabled={loading || !pathInput.trim()}>
            {loading ? 'Opening…' : 'Open'}
          </button>
        </form>

        {presets.length > 0 && (
          <div className="presets">
            <span className="presets-label">Presets:</span>
            {presets.map((p) => (
              <button
                key={p.path}
                className="chip"
                disabled={loading}
                onClick={() => void open(p.path)}
                title={p.path}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {error && <div className="error">⚠ {error}</div>}

      {loaded && !error && (
        <section className="viewer">
          <div className="meta">
            <span>
              {loaded.width} × {loaded.height}
            </span>
            <span>{(loaded.bytes / 1_048_576).toFixed(1)} MB PNG</span>
            <span>decoded in {loaded.decodeMs} ms</span>
            <button className="save" onClick={savePng}>
              ⭳ Save as PNG
            </button>
          </div>
          <div className="canvas-wrap">
            <img src={loaded.url} alt={loaded.fileName} />
          </div>
        </section>
      )}

      {!loaded && !error && !loading && (
        <div className="empty">Choose a preset or enter a file path to begin.</div>
      )}
    </div>
  );
}
