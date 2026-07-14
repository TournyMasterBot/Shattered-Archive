import type { PreviewResult } from '../../api/client.js';

interface Props {
  preview: PreviewResult;
}

/** Shows the exact generated file text plus the server's diff vs on-disk. */
export default function PreviewPane({ preview }: Props) {
  const { diff } = preview;
  return (
    <div className="mb-preview">
      <h3>Preview — exact file that would be written</h3>
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
