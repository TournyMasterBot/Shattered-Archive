import type { ExternalRef, PreviewResult } from '../../api/client.js';

interface Props {
  preview: PreviewResult;
  /** When given, resolved cross-area refs render as links that open the defining area/entity. */
  onNavigate?: (ref: ExternalRef) => void;
}

/**
 * Resolved cross-area reference list — proven links, each navigable when the
 * host page supplies onNavigate. Shared with the import report display.
 */
export function ExternalRefList({ refs, onNavigate }: { refs: ExternalRef[]; onNavigate?: (ref: ExternalRef) => void }) {
  if (refs.length === 0) return null;
  return (
    <details className="mb-preview-external">
      <summary>{refs.length} cross-area reference(s) — resolved, all targets exist</summary>
      <ul aria-label="Resolved cross-area references">
        {refs.map((r, i) => (
          <li key={i} title={r.where}>
            {onNavigate ? (
              <button type="button" className="mb-ref-link" onClick={() => onNavigate(r)}>
                {r.kind} #{r.vnum} — {r.name} ({r.file})
              </button>
            ) : (
              <span>
                {r.kind} #{r.vnum} — {r.name} ({r.file})
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Shows the exact generated file text plus the server's diff vs on-disk. */
export default function PreviewPane({ preview, onNavigate }: Props) {
  const { diff } = preview;
  return (
    <div className="mb-preview">
      <h3>Preview — exact file that would be written</h3>
      {preview.refs && preview.refs.warnings.length > 0 && (
        <details className="mb-preview-warnings">
          <summary>
            {preview.refs.warnings.length} INVALID reference(s) — the whole world was searched and no area defines
            these vnums (not blocking)
          </summary>
          <ul>
            {preview.refs.warnings.map((w, i) => (
              <li key={i} className="mb-invalid-ref">
                ✖ {w}
              </li>
            ))}
          </ul>
        </details>
      )}
      {preview.refs?.external && <ExternalRefList refs={preview.refs.external} onNavigate={onNavigate} />}
      {diff.identical ? (
        <p className="mb-muted">No changes vs the file on disk.</p>
      ) : (
        <div className="mb-diff">
          <p>
            Changes from line <strong>{diff.start}</strong>:
          </p>
          {diff.removed.length > 0 && (
            <pre className="mb-diff-removed" aria-label="Removed lines">
              {diff.removed.map((l) => `- ${l}`).join('\n')}
            </pre>
          )}
          {diff.added.length > 0 && (
            <pre className="mb-diff-added" aria-label="Added lines">
              {diff.added.map((l) => `+ ${l}`).join('\n')}
            </pre>
          )}
        </div>
      )}
      <details>
        <summary>Full generated file ({preview.text.split('\n').length} lines)</summary>
        <pre className="mb-preview-text">{preview.text}</pre>
      </details>
    </div>
  );
}
