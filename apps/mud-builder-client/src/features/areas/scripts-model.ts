import type { MobScript, ScriptsSection } from '@shatteredarchive/merc-area';

import type { AreaWorkbench } from './workbench.js';

export interface ScriptsEditor {
  /** Original index preserved — callers filter this, never re-derive a fresh array to index into. */
  scripts: { script: MobScript; index: number }[];
  addScript: (template: MobScript) => void;
  updateScript: (index: number, updated: MobScript) => void;
  removeScript: (index: number) => void;
}

/**
 * The #SCRIPTS array + its mutation closures, over a shared AreaWorkbench —
 * the same "get section, set section" shape as useResetsEditor
 * (reset-editing.tsx), extracted so the Areas dashboard's per-mob "Scripts"
 * accordion and per-room "Progs" accordion (both filter this SAME array by
 * attach/mobVnum — scripts are area-wide, not room-placement-scoped) share
 * one mutation path with ScriptsPage's own future adoption in mind.
 */
export function useAreaScripts(wb: AreaWorkbench): ScriptsEditor {
  const section = wb.area?.sections.find((s): s is ScriptsSection => s.kind === 'scripts');
  const raw = section?.scripts ?? [];
  const scripts = raw.map((script, index) => ({ script, index }));

  const setScripts = (next: MobScript[]) => {
    if (!wb.area) return;
    const sections = section
      ? next.length > 0
        ? wb.area.sections.map((s) => (s === section ? { ...s, scripts: next } : s))
        : wb.area.sections.filter((s) => s !== section)
      : // #SCRIPTS goes last so its mobs/rooms are already loaded at boot.
        [...wb.area.sections, { kind: 'scripts' as const, scripts: next }];
    wb.setAreaModel({ sections });
  };

  const addScript = (template: MobScript) => {
    setScripts([...raw, template]);
    wb.ok(`added a ${template.attach === 'room' ? 'room' : 'mob'} script (${template.trigger})`);
  };
  const updateScript = (index: number, updated: MobScript) => setScripts(raw.map((s, i) => (i === index ? updated : s)));
  const removeScript = (index: number) => {
    setScripts(raw.filter((_, i) => i !== index));
    wb.ok('script deleted');
  };

  return { scripts, addScript, updateScript, removeScript };
}
