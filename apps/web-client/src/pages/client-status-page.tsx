import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

type HealthResult = {
  ok: boolean;
  statusText: string;
  latency?: number;
};

async function checkEndpoint(label: string, url: string): Promise<HealthResult> {
  const start = performance.now();
  try {
    const res = await fetch(url, { method: 'GET' });
    const time = performance.now() - start;
    return {
      ok: res.ok,
      statusText: res.ok ? 'OK' : `HTTP ${res.status}`,
      latency: Math.round(time),
    };
  } catch (e) {
    return { ok: false, statusText: 'Connection Failed' };
  }
}

function ClientStatusPage() {
  const [results, setResults] = useState<{
    web: HealthResult | null;
  }>({
    web: null,
  });

  async function runChecks() {
    const [web] = await Promise.all([checkEndpoint('web-server', '/api/web/health')]);

    setResults({ web });
  }

  useEffect(() => {
    runChecks();

    // refresh every 5 seconds
    const id = setInterval(runChecks, 5000);
    return () => clearInterval(id);
  }, []);

  function renderRow(label: string, r: HealthResult | null) {
    if (!r)
      return (
        <tr>
          <td>{label}</td>
          <td colSpan={2}>Loading…</td>
        </tr>
      );

    return (
      <tr>
        <td>{label}</td>
        <td style={{ color: r.ok ? 'limegreen' : 'red' }}>{r.statusText}</td>
        <td>{r.latency ? `${r.latency} ms` : '-'}</td>
      </tr>
    );
  }

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>System Status</h1>
      <p style={{ opacity: 0.7 }}>Auto-refreshing every 5 seconds</p>

      <table
        style={{
          width: '100%',
          maxWidth: 600,
          borderCollapse: 'collapse',
          marginTop: 20,
        }}
      >
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Service</th>
            <th style={{ textAlign: 'left' }}>Status</th>
            <th style={{ textAlign: 'left' }}>Latency</th>
          </tr>
        </thead>
        <tbody>{renderRow('Web Server', results.web)}</tbody>
      </table>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<ClientStatusPage />);
