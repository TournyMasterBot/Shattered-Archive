// apps/game-client/src/components/simulacrumAdmin/GmcpTab.tsx
import React from 'react';
import styles from '../../styles/SimulacrumAdminWindow.module.scss';
import { findPackage } from '../../features/simulacrumAdmin/dslGmcpSchema';
import type { GmcpCapture, GmcpEntry } from '../../features/simulacrumAdmin/gmcpCapture';
import { buildParityReport, type PackageStatus, type Severity } from '../../features/simulacrumAdmin/gmcpParity';
import { MAX_DETAIL_CHARS, MAX_ROWS, detailText } from '../../features/simulacrumAdmin/gmcpView';

type View = 'messages' | 'parity';

interface GmcpTabProps {
  capture: GmcpCapture;
  /**
   * False while another tab is showing. The tab stays mounted (its filters and selection survive) but does no work and draws nothing,
   * so a stream of messages does not redraw 200 hidden rows each time.
   */
  visible?: boolean;
  /** Tests give their own; the page uses the clipboard. */
  copyText?: (text: string) => Promise<void>;
}

const STATUS_TEXT: Record<PackageStatus, string> = {
  'not-seen': 'Not seen yet',
  match: 'Matches DSL',
  noted: 'Matches DSL, with noted differences',
  differs: 'Differs from DSL',
};

const SEVERITY_TEXT: Record<Severity, string> = { error: 'Error', warn: 'Difference', info: 'Note' };

function clock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString([], { hour12: false });
}

const defaultCopy = (text: string): Promise<void> => navigator.clipboard.writeText(text);

const GmcpTab: React.FC<GmcpTabProps> = ({ capture, visible = true, copyText = defaultCopy }) => {
  const entries = React.useSyncExternalStore(capture.subscribe, capture.getEntries);
  const paused = React.useSyncExternalStore(capture.subscribe, capture.isPaused);
  const [view, setView] = React.useState<View>('messages');
  const [pkg, setPkg] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<number | undefined>();
  const [copied, setCopied] = React.useState('');

  const packages = React.useMemo(() => (visible ? [...new Set(entries.map((e) => e.pkg))].sort() : []), [visible, entries]);
  const matching = React.useMemo(() => {
    if (!visible) return [];
    const needle = search.trim().toLowerCase();
    return entries.filter((e) => (pkg === '' || e.pkg === pkg) && (needle === '' || e.raw.toLowerCase().includes(needle)));
  }, [visible, entries, pkg, search]);
  const shown = React.useMemo(() => matching.slice(-MAX_ROWS).reverse(), [matching]);
  const selected = selectedId === undefined ? undefined : entries.find((e) => e.id === selectedId);
  const report = React.useMemo(() => (visible && view === 'parity' ? buildParityReport(entries) : undefined), [visible, view, entries]);

  const copy = (label: string, text: string): void => {
    copyText(text)
      .then(() => setCopied(label))
      .catch(() => setCopied('Could not copy'));
  };

  if (!visible) return null;
  return (
    <div className={styles.gmcp}>
      <div className={styles.toolbar} role="group" aria-label="GMCP views">
        <button type="button" className={styles.smallButton} aria-pressed={view === 'messages'} onClick={() => setView('messages')}>
          Messages
        </button>
        <button type="button" className={styles.smallButton} aria-pressed={view === 'parity'} onClick={() => setView('parity')}>
          Parity with DSL
        </button>
        <span className={styles.spacer} />
        <button type="button" className={styles.smallButton} onClick={paused ? capture.resume : capture.pause}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className={styles.smallButton} onClick={capture.clear} disabled={entries.length === 0}>
          Clear
        </button>
      </div>
      {paused && <p className={styles.notice}>Paused: new messages are not being kept. The character level is still read.</p>}

      {view === 'messages' ? (
        <>
          <div className={styles.toolbar}>
            <label className={styles.field}>
              <span className={styles.visuallyHidden}>Package</span>
              <select className={styles.select} value={pkg} onChange={(e) => setPkg(e.target.value)} aria-label="Package">
                <option value="">All packages</option>
                {packages.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.visuallyHidden}>Search the messages</span>
              <input
                type="search"
                className={styles.input}
                placeholder="Search the messages"
                aria-label="Search the messages"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={styles.smallButton}
              disabled={shown.length === 0}
              onClick={() => copy('Copied the shown messages', [...shown].reverse().map((e) => e.raw).join('\n'))}
            >
              Copy shown
            </button>
          </div>
          <p className={styles.counts} role="status">
            {entries.length === 0
              ? 'No GMCP received yet.'
              : `${entries.length} kept, ${matching.length} match${shown.length < matching.length ? `, newest ${shown.length} shown. Narrow the filter to see more` : ''}.`}
            {copied !== '' && ` ${copied}.`}
          </p>

          <div className={styles.split}>
            <ul className={styles.messageList} aria-label="GMCP messages">
              {shown.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={styles.messageRow}
                    aria-pressed={entry.id === selectedId}
                    onClick={() => {
                      setSelectedId(entry.id);
                      setCopied('');
                    }}
                  >
                    <span className={styles.time}>{clock(entry.receivedAt)}</span>
                    <span className={styles.pkg}>{entry.pkg === '' ? '(empty)' : entry.pkg}</span>
                    <span className={styles.size}>{entry.size}</span>
                    {entry.parseError && <span className={styles.badgeBad}>{entry.parseError}</span>}
                    {entry.pkg !== '' && !findPackage(entry.pkg) && <span className={styles.badgeWarn}>not a DSL package</span>}
                  </button>
                </li>
              ))}
            </ul>
            <div className={styles.detail} aria-label="Selected message">
              {selected ? (
                <>
                  <div className={styles.toolbar}>
                    <strong>{selected.pkg === '' ? '(empty)' : selected.pkg}</strong>
                    <span className={styles.spacer} />
                    <button type="button" className={styles.smallButton} onClick={() => copy('Copied the message', selected.raw)}>
                      Copy message
                    </button>
                  </div>
                  <DetailBody entry={selected} />
                </>
              ) : (
                <p className={styles.empty}>Select a message to read it.</p>
              )}
            </div>
          </div>
        </>
      ) : (
        report && (
          <div className={styles.parity}>
            <p className={styles.empty}>
              Compared with what DSL sends (read from its live traffic; docs/game/gmcp-parity.md). {report.checked} message
              {report.checked === 1 ? '' : 's'} checked.
            </p>
            {report.unparsable > 0 && <p className={styles.notice}>{report.unparsable} DSL-package message(s) could not be parsed and were not compared.</p>}
            <ul className={styles.packageList}>
              {report.packages.map((p) => (
                <li key={p.name} className={styles.packageCard} data-status={p.status}>
                  <div className={styles.packageHead}>
                    <strong>{p.name}</strong>
                    <span className={styles.statusText}>{STATUS_TEXT[p.status]}</span>
                    <span className={styles.spacer} />
                    <span className={styles.size}>{p.seen} seen</span>
                  </div>
                  {p.status === 'not-seen' && p.name === 'login_data' && (
                    <p className={styles.empty}>Sent once, at login. Reconnect, or run “admin test gmcp login”, to see it.</p>
                  )}
                  {p.findings.length > 0 && (
                    <ul className={styles.findings}>
                      {p.findings.map((f) => (
                        <li key={`${f.code}|${f.path}|${f.value ?? ''}`} data-severity={f.severity}>
                          <span className={styles.severity}>{SEVERITY_TEXT[f.severity]}</span>
                          <code>{f.path === '' ? '(message)' : f.path}</code> {f.message}
                          {f.value !== undefined && (
                            <>
                              : <code>{f.value}</code>
                            </>
                          )}
                          <span className={styles.size}> ×{f.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            {report.unknownPackages.length > 0 && (
              <div className={styles.packageCard} data-status="differs">
                <div className={styles.packageHead}>
                  <strong>Packages DSL does not send</strong>
                </div>
                <ul className={styles.findings}>
                  {report.unknownPackages.map((u) => (
                    <li key={u.name} data-severity="warn">
                      <code>{u.name === '' ? '(empty)' : u.name}</code>
                      <span className={styles.size}> ×{u.seen}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};

const DetailBody: React.FC<{ entry: GmcpEntry }> = ({ entry }) => {
  const { text, truncated } = detailText(entry);
  return (
    <>
      {entry.parseError && <p className={styles.notice}>Could not be read as “package JSON”: {entry.parseError}.</p>}
      <pre className={styles.json}>{text}</pre>
      {truncated && <p className={styles.notice}>Shown cut at {MAX_DETAIL_CHARS / 1024} KB. “Copy message” copies all of it.</p>}
    </>
  );
};

export default GmcpTab;
