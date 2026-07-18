import type { AreaFile, AreaHeaderSection } from '@shatteredarchive/merc-area';

import { areaHeader, usedVnums } from './model-ops.js';
import { NumField, TextField } from './workbench.js';

/**
 * Compact #AREA header form (name, credits, vnum range). The range is guarded
 * twice: this component warns inline when the range no longer covers a vnum
 * the file defines, and the server rejects such a save (plus range overlaps
 * against every other listed area, which only the server can see).
 */
export default function AreaHeaderEditor({
  area,
  onChange,
}: {
  area: AreaFile;
  onChange: (next: AreaFile) => void;
}) {
  const header = areaHeader(area);
  if (!header) return null;

  const patch = (p: Partial<AreaHeaderSection>) => {
    onChange({
      sections: area.sections.map((s) => (s.kind === 'area' ? { ...s, ...p } : s)),
    });
  };

  const outside = [...usedVnums(area)].filter((v) => v < header.minVnum || v > header.maxVnum).sort((a, b) => a - b);

  return (
    <fieldset className="mb-fieldset mb-area-header">
      <legend>Area header</legend>
      <div className="mb-form-grid">
        <TextField label="Area name" value={header.name} onChange={(name) => patch({ name })} />
        <TextField label="Credits" value={header.credits} onChange={(credits) => patch({ credits })} />
        <NumField label="Min vnum" value={header.minVnum} onChange={(minVnum) => patch({ minVnum })} />
        <NumField label="Max vnum" value={header.maxVnum} onChange={(maxVnum) => patch({ maxVnum })} />
      </div>
      {outside.length > 0 && (
        <p className="mb-muted mb-warning">
          ⚠ range {header.minVnum}-{header.maxVnum} no longer covers defined vnum
          {outside.length > 1 ? 's' : ''} {outside.slice(0, 5).join(', ')}
          {outside.length > 5 ? ` (+${outside.length - 5} more)` : ''} — the server will refuse this save
        </p>
      )}
    </fieldset>
  );
}
