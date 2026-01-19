// apps\game-client\src\components\UserScriptSandboxModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useUserScriptSandbox, getUserScriptStorageKey } from '../hooks/useUserScriptSandbox';
import {
  AnyUserScript,
  TimerScript,
  TriggerScript,
  AliasScript,
  UserScriptLanguage,
} from '../features/userScripts/types';
import styles from '../styles/UserScriptSandboxModal.module.scss';
import { ROUTED_WINDOW_EVENTS } from '../features/plugins/routed-gmcp-events';
import { useGlobalScripts } from '../hooks/useGlobalScripts';
import { useUserVariables } from '../hooks/useUserVariables';

interface UserScriptSandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
}

// Desktop resize limits
const MIN_WIDTH = 700;
const MAX_WIDTH = 1400;
const MIN_HEIGHT = 400;
const MAX_HEIGHT = 900;

type ImportMode = 'merge' | 'replace';

type ExportFileV1 = {
  schema: 'shatteredArchive.export.v1';
  exportedAt: string;
  app?: string;
  items: Array<{
    storage: 'localStorage';
    key: string;
    format: 'json';
    kind: 'userScripts';
    selection?: { ids: string[] };
    strategyHint?: 'mergeById';
    value: AnyUserScript[];
  }>;
};

function nowIso() {
  return new Date().toISOString();
}

function safeFileStamp() {
  // YYYYMMDD-HHMMSS (local-ish, but fine for filename)
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(
    d.getSeconds(),
  )}`;
}

function downloadJson(filename: string, jsonText: string) {
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  // Cleanup
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isUserScriptLanguage(v: unknown): v is UserScriptLanguage {
  return v === 'text' || v === 'javascript' || v === 'lua' || v === 'python' || v === 'typescript';
}

function isUserScriptKind(v: unknown): v is 'trigger' | 'alias' | 'timer' {
  return v === 'trigger' || v === 'alias' || v === 'timer';
}

function isValidUserScript(v: unknown): v is AnyUserScript {
  if (!isObject(v)) return false;

  const id = v.id;
  const name = v.name;
  const enabled = v.enabled;
  const language = v.language;
  const source = v.source;
  const kind = v.kind;

  if (typeof id !== 'string' || id.trim().length === 0) return false;
  if (typeof name !== 'string') return false;
  if (typeof enabled !== 'boolean') return false;
  if (!isUserScriptLanguage(language)) return false;
  if (typeof source !== 'string') return false;
  if (!isUserScriptKind(kind)) return false;

  if (kind === 'trigger') {
    const eventName = (v as any).eventName;
    const matchText = (v as any).matchText;
    if (typeof eventName !== 'string') return false;
    if (typeof matchText !== 'string') return false;
    return true;
  }

  if (kind === 'timer') {
    const intervalMs = (v as any).intervalMs;
    if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs) || intervalMs < 0) return false;
    return true;
  }

  if (kind === 'alias') {
    const alias = (v as any).alias;
    if (typeof alias !== 'string') return false;
    return true;
  }

  return false;
}

function tryParseExportFile(text: string): { ok: true; file: ExportFileV1 } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text);

    if (!isObject(parsed)) return { ok: false, error: 'Root JSON must be an object.' };
    if (parsed.schema !== 'shatteredArchive.export.v1') return { ok: false, error: 'Unsupported schema.' };
    if (!Array.isArray(parsed.items)) return { ok: false, error: 'Missing items array.' };

    const items: ExportFileV1['items'] = [];
    for (const it of parsed.items) {
      if (!isObject(it)) return { ok: false, error: 'Invalid item shape.' };
      if (it.storage !== 'localStorage') return { ok: false, error: 'Unsupported storage type.' };
      if (it.format !== 'json') return { ok: false, error: 'Unsupported format.' };
      if (it.kind !== 'userScripts') return { ok: false, error: 'Unsupported kind.' };
      if (typeof it.key !== 'string' || it.key.trim().length === 0) return { ok: false, error: 'Invalid key.' };
      if (!Array.isArray(it.value)) return { ok: false, error: 'Invalid value (expected array).' };

      const validScripts = it.value.filter(isValidUserScript);
      items.push({
        storage: 'localStorage',
        key: it.key,
        format: 'json',
        kind: 'userScripts',
        selection:
          isObject(it.selection) && Array.isArray((it.selection as any).ids)
            ? { ids: (it.selection as any).ids }
            : undefined,
        strategyHint: it.strategyHint === 'mergeById' ? 'mergeById' : undefined,
        value: validScripts,
      });
    }

    const file: ExportFileV1 = {
      schema: 'shatteredArchive.export.v1',
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : nowIso(),
      app: typeof parsed.app === 'string' ? parsed.app : undefined,
      items,
    };

    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err ?? 'Parse error') };
  }
}

type ImportExportModalProps = {
  isOpen: boolean;
  mode: 'export' | 'import';
  onClose: () => void;
  connectionId: string;
  scripts: AnyUserScript[];
  onImport: (incoming: AnyUserScript[], mode: ImportMode) => { imported: number; skipped: number };
};

const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  mode,
  onClose,
  connectionId,
  scripts,
  onImport,
}) => {
  const storageKey = useMemo(() => getUserScriptStorageKey(connectionId), [connectionId]);

  // Export selection
  const [exportFilter, setExportFilter] = useState('');
  const [exportKindFilter, setExportKindFilter] = useState<{ trigger: boolean; alias: boolean; timer: boolean }>({
    trigger: true,
    alias: true,
    timer: true,
  });
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  // Import
  const [importText, setImportText] = useState('');
  const [importParseError, setImportParseError] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<ExportFileV1 | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [importItemEnabled, setImportItemEnabled] = useState<Record<string, boolean>>({}); // key -> enabled
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

  const filteredScripts = useMemo(() => {
    const q = exportFilter.trim().toLowerCase();

    return scripts
      .filter((s) => exportKindFilter[s.kind])
      .filter((s) => {
        if (!q) return true;
        const hay = `${s.name} ${s.kind} ${s.id} ${s.kind === 'alias' ? (s as AliasScript).alias : ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice()
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind)));
  }, [scripts, exportFilter, exportKindFilter]);

  const selectedCount = useMemo(() => Object.values(selectedIds).filter(Boolean).length, [selectedIds]);

  useEffect(() => {
    if (!isOpen) return;

    // Reset state on open (but keep mode passed in)
    setExportFilter('');
    setExportKindFilter({ trigger: true, alias: true, timer: true });
    setSelectedIds({});
    setImportText('');
    setImportParseError(null);
    setImportFile(null);
    setImportMode('merge');
    setImportItemEnabled({});
    setImportResult(null);
  }, [isOpen]);

  useEffect(() => {
    // When parsing import text
    if (mode !== 'import') return;
    if (!importText.trim()) {
      setImportParseError(null);
      setImportFile(null);
      setImportItemEnabled({});
      setImportResult(null);
      return;
    }

    const parsed = tryParseExportFile(importText);
    if (!parsed.ok) {
      setImportParseError(parsed.error);
      setImportFile(null);
      setImportItemEnabled({});
      setImportResult(null);
      return;
    }

    setImportParseError(null);
    setImportFile(parsed.file);

    // Default enable all items
    const enabledMap: Record<string, boolean> = {};
    for (const it of parsed.file.items) enabledMap[it.key] = true;
    setImportItemEnabled(enabledMap);
    setImportResult(null);
  }, [importText, mode]);

  if (!isOpen) return null;

  const toggleAllFiltered = (checked: boolean) => {
    const next: Record<string, boolean> = { ...selectedIds };
    for (const s of filteredScripts) next[s.id] = checked;
    setSelectedIds(next);
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  };

  const buildExport = () => {
    const ids = Object.entries(selectedIds)
      .filter(([, v]) => v)
      .map(([k]) => k);

    const picked = scripts.filter((s) => ids.includes(s.id));

    const file: ExportFileV1 = {
      schema: 'shatteredArchive.export.v1',
      exportedAt: nowIso(),
      app: 'shatteredArchive.game-client',
      items: [
        {
          storage: 'localStorage',
          key: storageKey,
          format: 'json',
          kind: 'userScripts',
          selection: { ids },
          strategyHint: 'mergeById',
          value: picked,
        },
      ],
    };

    return JSON.stringify(file, null, 2);
  };

  const handleExportDownload = () => {
    const json = buildExport();
    const fname = `shatteredArchive-userScripts-${connectionId || 'default'}-${safeFileStamp()}.json`;
    downloadJson(fname, json);
  };

  const handleImportApply = () => {
    if (!importFile) return;

    // For now: only apply items matching THIS connection's userScripts key.
    // (Later: you can add a key picker / remap UI.)
    const eligible = importFile.items.filter((it) => importItemEnabled[it.key]);

    const targetKey = storageKey;
    const matching = eligible.filter((it) => it.key === targetKey);

    const incoming = matching.flatMap((it) => it.value).filter(isValidUserScript);

    const skipped = matching.reduce(
      (acc, it) => acc + (it.value.length - it.value.filter(isValidUserScript).length),
      0,
    );

    const res = onImport(incoming, importMode);
    setImportResult({ imported: res.imported, skipped: res.skipped + skipped });
  };

  const totalParsedItems = importFile?.items.length ?? 0;

  return (
    <div className={styles.ieBackdrop}>
      <div className={styles.ieModal}>
        <div className={styles.ieHeader}>
          <div className={styles.ieTitle}>{mode === 'export' ? 'Export User Scripts' : 'Import User Scripts'}</div>
          <button type="button" className={styles.ieCloseButton} onClick={onClose}>
            ✕
          </button>
        </div>

        {mode === 'export' ? (
          <div className={styles.ieBody}>
            <div className={styles.ieHintRow}>
              <div className={styles.ieHint}>
                Exporting from key: <span className={styles.ieMono}>{storageKey}</span>
              </div>
            </div>

            <div className={styles.ieControlsRow}>
              <input
                className={styles.ieSearch}
                value={exportFilter}
                onChange={(e) => setExportFilter(e.target.value)}
                placeholder="Search name / kind / alias / id"
              />

              <label className={styles.ieKindToggle}>
                <input
                  type="checkbox"
                  checked={exportKindFilter.trigger}
                  onChange={(e) => setExportKindFilter((p) => ({ ...p, trigger: e.target.checked }))}
                />
                <span>Triggers</span>
              </label>

              <label className={styles.ieKindToggle}>
                <input
                  type="checkbox"
                  checked={exportKindFilter.alias}
                  onChange={(e) => setExportKindFilter((p) => ({ ...p, alias: e.target.checked }))}
                />
                <span>Aliases</span>
              </label>

              <label className={styles.ieKindToggle}>
                <input
                  type="checkbox"
                  checked={exportKindFilter.timer}
                  onChange={(e) => setExportKindFilter((p) => ({ ...p, timer: e.target.checked }))}
                />
                <span>Timers</span>
              </label>

              <button type="button" className={styles.ieSmallButton} onClick={() => toggleAllFiltered(true)}>
                Select filtered
              </button>
              <button type="button" className={styles.ieSmallButton} onClick={() => toggleAllFiltered(false)}>
                Clear filtered
              </button>
            </div>

            <div className={styles.ieList}>
              {filteredScripts.map((s) => (
                <label key={s.id} className={styles.ieRow}>
                  <input
                    type="checkbox"
                    checked={!!selectedIds[s.id]}
                    onChange={(e) => toggleOne(s.id, e.target.checked)}
                  />
                  <div className={styles.ieRowMain}>
                    <div className={styles.ieRowTitle}>
                      <span className={styles.ieRowName}>{s.name}</span>
                      <span className={styles.ieRowKind}>{s.kind}</span>
                      {!s.enabled && <span className={styles.ieRowDisabled}>disabled</span>}
                    </div>

                    {s.kind === 'alias' && (
                      <div className={styles.ieRowSub}>
                        alias: <span className={styles.ieMono}>{(s as AliasScript).alias}</span>
                      </div>
                    )}

                    {s.kind === 'trigger' && (
                      <div className={styles.ieRowSub}>
                        event: <span className={styles.ieMono}>{(s as TriggerScript).eventName}</span> · match:{' '}
                        <span className={styles.ieMono}>{(s as TriggerScript).matchText || '(empty)'}</span>
                      </div>
                    )}

                    {s.kind === 'timer' && (
                      <div className={styles.ieRowSub}>
                        intervalMs: <span className={styles.ieMono}>{String((s as TimerScript).intervalMs)}</span>
                      </div>
                    )}
                  </div>
                </label>
              ))}

              {filteredScripts.length === 0 && <div className={styles.ieEmpty}>No scripts match your filters.</div>}
            </div>

            <div className={styles.ieFooter}>
              <div className={styles.ieFooterLeft}>Selected: {selectedCount}</div>
              <button
                type="button"
                className={styles.iePrimaryButton}
                onClick={handleExportDownload}
                disabled={selectedCount === 0}
                title={selectedCount === 0 ? 'Select at least one script' : 'Download export JSON'}
              >
                Export selected (.json)
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.ieBody}>
            <div className={styles.ieHintRow}>
              <div className={styles.ieHint}>
                Import target key: <span className={styles.ieMono}>{storageKey}</span>
              </div>
            </div>

            <div className={styles.ieImportRow}>
              <div className={styles.ieImportCol}>
                <div className={styles.ieSectionTitle}>Paste export JSON</div>
                <textarea
                  className={styles.ieTextarea}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste the exported JSON here..."
                  spellCheck={false}
                />
              </div>

              <div className={styles.ieImportCol}>
                <div className={styles.ieSectionTitle}>Or choose a file</div>
                <input
                  type="file"
                  accept="application/json,.json"
                  className={styles.ieFileInput}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => setImportText(String(reader.result ?? ''));
                    reader.onerror = () => setImportText('');
                    reader.readAsText(f);
                  }}
                />

                <div className={styles.ieSectionTitle} style={{ marginTop: 10 }}>
                  Import mode
                </div>
                <label className={styles.ieRadioRow}>
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                  />
                  <span>Merge (by id)</span>
                </label>
                <label className={styles.ieRadioRow}>
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                  />
                  <span>Replace entire key</span>
                </label>

                <div className={styles.ieParseInfo}>
                  {importParseError ? (
                    <div className={styles.ieErrorText}>Parse error: {importParseError}</div>
                  ) : importFile ? (
                    <>
                      <div>
                        Parsed items: <span className={styles.ieMono}>{String(totalParsedItems)}</span>
                      </div>
                      <div className={styles.ieItemsBox}>
                        {importFile.items.map((it) => (
                          <label key={it.key} className={styles.ieItemRow}>
                            <input
                              type="checkbox"
                              checked={importItemEnabled[it.key] ?? true}
                              onChange={(e) => setImportItemEnabled((p) => ({ ...p, [it.key]: e.target.checked }))}
                            />
                            <div className={styles.ieItemText}>
                              <div className={styles.ieMono}>{it.key}</div>
                              <div className={styles.ieItemSub}>
                                kind: {it.kind} · entries: {it.value.length}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>

                      {importResult && (
                        <div className={styles.ieResultText}>
                          Imported: {importResult.imported} · Skipped: {importResult.skipped}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className={styles.ieMuted}>Paste JSON or choose a file to preview.</div>
                  )}
                </div>

                <div className={styles.ieFooter} style={{ marginTop: 10 }}>
                  <div className={styles.ieFooterLeft} />
                  <button
                    type="button"
                    className={styles.iePrimaryButton}
                    onClick={handleImportApply}
                    disabled={!importFile}
                    title={!importFile ? 'Provide a valid export JSON first' : 'Apply import'}
                  >
                    Import
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.ieMuted} style={{ marginTop: 8 }}>
              Note: this import currently applies only to the exact matching key for this connection.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const UserScriptSandboxModal: React.FC<UserScriptSandboxModalProps> = ({ isOpen, onClose, connectionId }) => {
  const {
    scripts,
    errors,
    clearErrors,
    createTrigger,
    createAlias,
    createTimer,
    upsertScript,
    removeScript,
    setScriptEnabled,
    runScriptNow,
    mergeScripts,
    replaceAllScripts,
  } = useUserScriptSandbox(connectionId);

  // NEW: globals + named variables (for "{NAME}" templates)
  const globalMgr = useGlobalScripts(connectionId);
  const namedVars = useUserVariables(connectionId);

  const [activeTab, setActiveTab] = useState<'triggers' | 'aliases' | 'timers' | 'globals' | 'variables'>('triggers');

  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [editorName, setEditorName] = useState<string>('');
  const [editorSource, setEditorSource] = useState<string>('');
  const [editorLanguage, setEditorLanguage] = useState<UserScriptLanguage>('text');

  // Trigger-specific state
  const [triggerEventName, setTriggerEventName] = useState<string>('event:line');
  const [triggerMatchText, setTriggerMatchText] = useState<string>('');
  const [triggerTestInput, setTriggerTestInput] = useState<string>('');
  const [triggerOmitFromOutput, setTriggerOmitFromOutput] = useState<boolean>(false);

  // Alias-specific state
  const [aliasKey, setAliasKey] = useState<string>('');

  // Timer-specific state
  const [timerIntervalSeconds, setTimerIntervalSeconds] = useState<string>('');

  // Import/Export modal state
  const [ieOpen, setIeOpen] = useState(false);
  const [ieMode, setIeMode] = useState<'export' | 'import'>('export');

  // Modal sizing
  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  });

  const [modalWidth, setModalWidth] = useState<number>(900);
  const [modalHeight, setModalHeight] = useState<number>(600);

  // NEW: Globals tab UI state
  const [globalLanguage, setGlobalLanguage] = useState<'javascript' | 'lua' | 'python' | 'typescript'>('javascript');
  const [globalDraft, setGlobalDraft] = useState<string>('');
  const [globalVarKey, setGlobalVarKey] = useState<string>('');
  const [globalVarValue, setGlobalVarValue] = useState<string>('');

  // NEW: Variables tab UI state
  const [namedVarKey, setNamedVarKey] = useState<string>('');
  const [namedVarValue, setNamedVarValue] = useState<string>('');

  // Track viewport size
  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      setIsSmallScreen(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset all editor state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedScriptId(null);
      setEditorName('');
      setEditorSource('');
      setEditorLanguage('text');
      setTriggerEventName('event:line');
      setTriggerMatchText('');
      setTriggerTestInput('');
      setTriggerOmitFromOutput(false);
      setAliasKey('');
      setTimerIntervalSeconds('');
      setIeOpen(false);
      setIeMode('export');

      setGlobalLanguage('javascript');
      setGlobalDraft('');
      setGlobalVarKey('');
      setGlobalVarValue('');
      setNamedVarKey('');
      setNamedVarValue('');
    }
  }, [isOpen]);

  // Reset selection when switching tabs
  useEffect(() => {
    setSelectedScriptId(null);
    setEditorName('');
    setEditorSource('');
    setEditorLanguage('text');
    setTriggerEventName('event:line');
    setTriggerMatchText('');
    setTriggerTestInput('');
    setTriggerOmitFromOutput(false);
    setAliasKey('');
    setTimerIntervalSeconds('');
  }, [activeTab]);

  // Keep global draft synced to chosen language (only when switching language)
  useEffect(() => {
    const src = globalMgr.sources?.[globalLanguage] ?? '';
    setGlobalDraft(src);
  }, [globalLanguage, globalMgr.sources]);

  // ------------- Derived values -------------

  const scriptsOfKind = (kind: 'trigger' | 'alias' | 'timer') => scripts.filter((s) => s.kind === kind);

  const selectedScript: AnyUserScript | undefined = selectedScriptId
    ? scripts.find((s) => s.id === selectedScriptId)
    : undefined;

  const baseTriggerEventName =
    selectedScript && selectedScript.kind === 'trigger'
      ? ((selectedScript as TriggerScript).eventName ?? 'event:line')
      : 'event:line';

  const baseTriggerMatchText =
    selectedScript && selectedScript.kind === 'trigger' ? ((selectedScript as TriggerScript).matchText ?? '') : '';

  const baseTriggerOmitFromOutput =
    selectedScript && selectedScript.kind === 'trigger' ? !!(selectedScript as TriggerScript).omitFromOutput : false;

  const baseTimerIntervalSeconds =
    selectedScript && selectedScript.kind === 'timer'
      ? String(
          (selectedScript as TimerScript).intervalMs
            ? Math.round((selectedScript as TimerScript).intervalMs / 1000)
            : 5,
        )
      : '';

  const baseAliasKey =
    selectedScript && selectedScript.kind === 'alias' ? ((selectedScript as AliasScript).alias ?? '') : '';

  const hasDraftChanges =
    !!selectedScript &&
    (editorName !== selectedScript.name ||
      editorSource !== selectedScript.source ||
      editorLanguage !== selectedScript.language ||
      (selectedScript.kind === 'trigger' &&
        (triggerEventName !== baseTriggerEventName ||
          triggerMatchText !== baseTriggerMatchText ||
          triggerOmitFromOutput !== baseTriggerOmitFromOutput)) ||
      (selectedScript.kind === 'timer' && timerIntervalSeconds !== baseTimerIntervalSeconds) ||
      (selectedScript.kind === 'alias' && aliasKey !== baseAliasKey));

  const hasGlobalDraftChanges = (globalMgr.sources?.[globalLanguage] ?? '') !== (globalDraft ?? '');

  if (!isOpen) {
    return null;
  }

  // ------------- Handlers -------------

  const handleSelectScript = (script: AnyUserScript) => {
    setSelectedScriptId(script.id);
    setEditorName(script.name ?? '');
    setEditorSource(script.source);
    setEditorLanguage(script.language);

    if (script.kind === 'trigger') {
      const trig = script as TriggerScript;
      setTriggerEventName(trig.eventName ?? 'event:line');
      setTriggerMatchText(trig.matchText ?? '');
      setTriggerOmitFromOutput(!!trig.omitFromOutput);
      setAliasKey('');
      setTimerIntervalSeconds('');
    } else if (script.kind === 'timer') {
      const t = script as TimerScript;
      const secs = t.intervalMs ? Math.round(t.intervalMs / 1000) : 5;
      setTimerIntervalSeconds(String(secs));
      setTriggerEventName('event:line');
      setTriggerMatchText('');
      setTriggerOmitFromOutput(false);
      setAliasKey('');
    } else if (script.kind === 'alias') {
      const a = script as AliasScript;
      setAliasKey(a.alias ?? '');
      setTriggerEventName('event:line');
      setTriggerMatchText('');
      setTriggerOmitFromOutput(false);
      setTimerIntervalSeconds('');
    } else {
      setTriggerEventName('event:line');
      setTriggerMatchText('');
      setTriggerOmitFromOutput(false);
      setAliasKey('');
      setTimerIntervalSeconds('');
    }

    setTriggerTestInput('');
  };

  const handleNewScript = () => {
    if (activeTab === 'triggers') {
      const s = createTrigger({
        name: 'New Trigger',
        enabled: false,
        language: 'text',
        source: `say Trigger fired
look`,
        eventName: 'event:line',
        matchText: '',
        omitFromOutput: false,
      });
      handleSelectScript(s);
      setActiveTab('triggers');
    } else if (activeTab === 'aliases') {
      const s = createAlias({
        name: 'New Alias',
        alias: 'l',
        enabled: false,
        language: 'text',
        source: `look`,
      });
      handleSelectScript(s);
      setActiveTab('aliases');
    } else if (activeTab === 'timers') {
      const s = createTimer({
        name: 'New Timer',
        enabled: false,
        language: 'text',
        source: `score`,
        intervalMs: 5000,
      });
      handleSelectScript(s);
      setActiveTab('timers');
    }
  };

  const handleSaveScript = () => {
    if (!selectedScript) return;

    const updated: AnyUserScript = {
      ...selectedScript,
      name: editorName || selectedScript.name,
      source: editorSource,
      language: editorLanguage,
    };

    if (updated.kind === 'trigger') {
      const trig = updated as TriggerScript;
      trig.eventName = triggerEventName || 'event:line';
      trig.matchText = triggerMatchText || '';
      trig.omitFromOutput = !!triggerOmitFromOutput;
    } else if (updated.kind === 'timer') {
      const secs = Number(timerIntervalSeconds);
      const clampedSecs = Number.isFinite(secs) && secs > 0 ? secs : 5;
      (updated as TimerScript).intervalMs = clampedSecs * 1000;
    } else if (updated.kind === 'alias') {
      const a = updated as AliasScript;
      a.alias = aliasKey || '';
    }

    upsertScript(updated);
  };

  const handleDiscardDraft = () => {
    if (!selectedScript) return;

    setEditorName(selectedScript.name);
    setEditorSource(selectedScript.source);
    setEditorLanguage(selectedScript.language);

    if (selectedScript.kind === 'trigger') {
      setTriggerEventName(baseTriggerEventName);
      setTriggerMatchText(baseTriggerMatchText);
      setTriggerOmitFromOutput(baseTriggerOmitFromOutput);
    } else if (selectedScript.kind === 'timer') {
      setTimerIntervalSeconds(baseTimerIntervalSeconds);
    } else if (selectedScript.kind === 'alias') {
      setAliasKey(baseAliasKey);
    }

    setTriggerTestInput('');
  };

  const handleDeleteScript = () => {
    if (!selectedScript) return;
    removeScript(selectedScript.id);

    setSelectedScriptId(null);
    setEditorName('');
    setEditorSource('');
    setEditorLanguage('text');
    setTriggerEventName('event:line');
    setTriggerMatchText('');
    setTriggerTestInput('');
    setTriggerOmitFromOutput(false);
    setAliasKey('');
    setTimerIntervalSeconds('');
  };

  const handleToggleEnabled = (script: AnyUserScript) => {
    setScriptEnabled(script.id, !script.enabled);
  };

  const handleTestScript = () => {
    if (!selectedScript) return;

    const apiExtras =
      selectedScript.kind === 'trigger'
        ? {
            event: {
              name: baseTriggerEventName,
              payload: triggerTestInput,
            },
          }
        : undefined;

    runScriptNow(selectedScript, apiExtras);
  };

  const handleTestDraftScript = () => {
    if (!selectedScript) return;

    const draft: AnyUserScript = {
      ...selectedScript,
      name: editorName || selectedScript.name,
      source: editorSource,
      language: editorLanguage,
    };

    if (draft.kind === 'trigger') {
      const trig = draft as TriggerScript;
      trig.eventName = triggerEventName || 'event:line';
      trig.matchText = triggerMatchText || '';
      trig.omitFromOutput = !!triggerOmitFromOutput;
    } else if (draft.kind === 'timer') {
      const secs = Number(timerIntervalSeconds);
      const clampedSecs = Number.isFinite(secs) && secs > 0 ? secs : 5;
      (draft as TimerScript).intervalMs = clampedSecs * 1000;
    } else if (draft.kind === 'alias') {
      const a = draft as AliasScript;
      a.alias = aliasKey || '';
    }

    const apiExtras =
      draft.kind === 'trigger'
        ? {
            event: {
              name: triggerEventName || 'event:line',
              payload: triggerTestInput,
            },
          }
        : undefined;

    runScriptNow(draft, apiExtras);
  };

  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isSmallScreen) return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = modalWidth;
    const startHeight = modalHeight;

    const onMouseMove = (ev: MouseEvent) => {
      const deltaX = ev.clientX - startX;
      const deltaY = ev.clientY - startY;

      let nextWidth = startWidth + deltaX;
      let nextHeight = startHeight + deltaY;

      nextWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, nextWidth));
      nextHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, nextHeight));

      setModalWidth(nextWidth);
      setModalHeight(nextHeight);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const modalStyle: React.CSSProperties = isSmallScreen
    ? {}
    : {
        width: modalWidth,
        height: modalHeight,
      };

  const handleImport = (incoming: AnyUserScript[], mode: ImportMode) => {
    const valid = incoming.filter(isValidUserScript);
    const skipped = incoming.length - valid.length;

    if (mode === 'replace') {
      replaceAllScripts(valid);
      return { imported: valid.length, skipped };
    }

    const res = mergeScripts(valid);
    return { imported: res.imported, skipped: res.skipped + skipped };
  };

  const renderGlobalsTab = () => {
    const varsEntries = Object.entries(globalMgr.vars ?? {}).sort(([a], [b]) => a.localeCompare(b));

    return (
      <div className={styles.body} style={{ flexDirection: 'column' }}>
        <div className={styles.editorPane} style={{ borderRight: 'none' as any }}>
          <div className={styles.editorHeader}>
            <div className={styles.title} style={{ marginRight: 10 }}>
              Global Scripts
            </div>

            <label className={styles.languageLabel}>
              <select
                className={styles.languageSelect}
                value={globalLanguage}
                onChange={(e) => setGlobalLanguage(e.target.value as any)}
              >
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="lua">Lua</option>
                <option value="python">Python</option>
              </select>
            </label>

            {hasGlobalDraftChanges && <span className={styles.draftIndicator}>Unsaved changes</span>}

            <button
              type="button"
              className={styles.saveButton}
              onClick={() => globalMgr.saveSource(globalLanguage, globalDraft)}
              disabled={!hasGlobalDraftChanges}
            >
              Save
            </button>
          </div>

          <div className={styles.ieMuted} style={{ marginBottom: 8 }}>
            Call a function from any script using:{' '}
            <span className={styles.ieMono}>{`global.${globalLanguage}.myFunction`}</span>
            <br />
            For Lua/Python, dotted names map to underscores. Example:{' '}
            <span className={styles.ieMono}>global.lua.foo.bar</span> →{' '}
            <span className={styles.ieMono}>foo_bar(argsJson)</span>
          </div>

          <textarea
            className={styles.editorTextarea}
            value={globalDraft}
            onChange={(e) => setGlobalDraft(e.target.value)}
            spellCheck={false}
          />

          <div className={styles.ieMuted} style={{ marginTop: 10 }}>
            Global Variables (persisted, cached in memory)
          </div>

          <div className={styles.triggerConfigRow} style={{ marginTop: 6 }}>
            <label className={styles.configLabel}>
              Key
              <input
                type="text"
                className={styles.configInput}
                value={globalVarKey}
                onChange={(e) => setGlobalVarKey(e.target.value)}
                placeholder="e.g. lastTarget"
              />
            </label>

            <label className={styles.configLabel} style={{ flex: 1 }}>
              Value (string or JSON)
              <input
                type="text"
                className={styles.configInput}
                value={globalVarValue}
                onChange={(e) => setGlobalVarValue(e.target.value)}
                placeholder='e.g. "orc" or {"hp":12}'
              />
            </label>

            <button
              type="button"
              className={styles.saveButton}
              onClick={() => {
                const k = globalVarKey.trim();
                if (!k) return;

                // Store JSON when valid, otherwise store raw string
                let v: any = globalVarValue;
                try {
                  v = JSON.parse(globalVarValue);
                } catch {
                  // keep string
                }

                globalMgr.setVar(k, v);
                setGlobalVarKey('');
                setGlobalVarValue('');
              }}
            >
              Set
            </button>
          </div>

          <div className={styles.ieItemsBox} style={{ marginTop: 8, maxHeight: 220 }}>
            {varsEntries.length === 0 ? (
              <div className={styles.ieEmpty}>No global variables yet.</div>
            ) : (
              varsEntries.map(([k, v]) => (
                <div key={k} className={styles.ieItemRow}>
                  <div className={styles.ieItemText}>
                    <div className={styles.ieMono}>{k}</div>
                    <div className={styles.ieItemSub}>{typeof v === 'string' ? v : JSON.stringify(v)}</div>
                  </div>
                  <button type="button" className={styles.ieSmallButton} onClick={() => globalMgr.removeVar(k)}>
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderVariablesTab = () => {
    const entries = Object.entries(namedVars.vars ?? {}).sort(([a], [b]) => a.localeCompare(b));

    return (
      <div className={styles.body} style={{ flexDirection: 'column' }}>
        <div className={styles.editorPane} style={{ borderRight: 'none' as any }}>
          <div className={styles.editorHeader}>
            <div className={styles.title} style={{ marginRight: 10 }}>
              Named Variables
            </div>
          </div>

          <div className={styles.ieMuted} style={{ marginBottom: 8 }}>
            Use variables in trigger match text and alias commands with:
            <br />
            <span className={styles.ieMono}>{'{VARIABLE}'}</span>
          </div>

          <div className={styles.triggerConfigRow}>
            <label className={styles.configLabel}>
              Name
              <input
                type="text"
                className={styles.configInput}
                value={namedVarKey}
                onChange={(e) => setNamedVarKey(e.target.value)}
                placeholder="e.g. TARGET"
              />
            </label>

            <label className={styles.configLabel} style={{ flex: 1 }}>
              Value
              <input
                type="text"
                className={styles.configInput}
                value={namedVarValue}
                onChange={(e) => setNamedVarValue(e.target.value)}
                placeholder="e.g. orc guard"
              />
            </label>

            <button
              type="button"
              className={styles.saveButton}
              onClick={() => {
                const k = namedVarKey.trim();
                if (!k) return;
                namedVars.setVar(k, namedVarValue ?? '');
                setNamedVarKey('');
                setNamedVarValue('');
              }}
            >
              Save
            </button>
          </div>

          <div className={styles.ieItemsBox} style={{ marginTop: 8, maxHeight: 320 }}>
            {entries.length === 0 ? (
              <div className={styles.ieEmpty}>No named variables yet.</div>
            ) : (
              entries.map(([k, v]) => (
                <div key={k} className={styles.ieItemRow}>
                  <div className={styles.ieItemText}>
                    <div className={styles.ieMono}>{k}</div>
                    <div className={styles.ieItemSub}>{v}</div>
                  </div>
                  <button type="button" className={styles.ieSmallButton} onClick={() => namedVars.removeVar(k)}>
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>

          <div className={styles.ieMuted} style={{ marginTop: 10 }}>
            Note: the matching engine that expands these variables must be applied where triggers and aliases are
            matched against incoming text/user input.
          </div>
        </div>
      </div>
    );
  };

  const showScriptTabs = activeTab === 'triggers' || activeTab === 'aliases' || activeTab === 'timers';

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal} style={modalStyle}>
        <div className={styles.header}>
          <div className={styles.title}>User Script Sandbox</div>

          <div className={styles.headerButtons}>
            <button
              type="button"
              className={styles.headerActionButton}
              onClick={() => {
                setIeMode('export');
                setIeOpen(true);
              }}
              title="Export selected scripts to a JSON file"
            >
              Export
            </button>
            <button
              type="button"
              className={styles.headerActionButton}
              onClick={() => {
                setIeMode('import');
                setIeOpen(true);
              }}
              title="Import scripts from an export JSON file"
            >
              Import
            </button>
          </div>

          <button type="button" className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'triggers' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('triggers')}
          >
            Triggers
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'aliases' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('aliases')}
          >
            Aliases
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'timers' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('timers')}
          >
            Timers
          </button>

          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'globals' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('globals')}
          >
            Globals
          </button>

          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'variables' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('variables')}
          >
            Variables
          </button>

          {showScriptTabs && (
            <button type="button" className={styles.newButton} onClick={handleNewScript}>
              + New
            </button>
          )}
        </div>

        {activeTab === 'globals' ? (
          renderGlobalsTab()
        ) : activeTab === 'variables' ? (
          renderVariablesTab()
        ) : (
          <div className={styles.body}>
            <div className={styles.listPane}>
              {scriptsOfKind(activeTab === 'triggers' ? 'trigger' : activeTab === 'aliases' ? 'alias' : 'timer').map(
                (script) => (
                  <button
                    key={script.id}
                    type="button"
                    className={`${styles.scriptItem} ${selectedScriptId === script.id ? styles.scriptItemActive : ''}`}
                    onClick={() => handleSelectScript(script)}
                  >
                    <span className={styles.scriptName}>{script.name}</span>
                    {!script.enabled && <span className={styles.scriptDisabled}>· disabled</span>}
                    <input
                      type="checkbox"
                      className={styles.enabledCheckbox}
                      checked={script.enabled}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggleEnabled(script);
                      }}
                      title={script.enabled ? 'Click to disable' : 'Click to enable'}
                    />
                  </button>
                ),
              )}
            </div>

            <div className={styles.editorPane}>
              {selectedScript ? (
                <>
                  <div className={styles.editorHeader}>
                    <input
                      className={styles.nameInput}
                      value={editorName}
                      onChange={(e) => setEditorName(e.target.value)}
                      placeholder="Script name"
                    />

                    <label className={styles.languageLabel}>
                      <select
                        className={styles.languageSelect}
                        value={editorLanguage}
                        onChange={(e) => setEditorLanguage(e.target.value as UserScriptLanguage)}
                      >
                        <option value="text">Plain text</option>
                        <option value="javascript">JavaScript</option>
                        <option value="lua">Lua</option>
                        <option value="python">Python</option>
                        <option value="typescript">TypeScript</option>
                      </select>
                    </label>

                    {hasDraftChanges && <span className={styles.draftIndicator}>Unsaved changes</span>}

                    <button type="button" className={styles.testButton} onClick={handleTestScript}>
                      Test
                    </button>

                    {hasDraftChanges && (
                      <button type="button" className={styles.testDraftButton} onClick={handleTestDraftScript}>
                        Test Draft
                      </button>
                    )}

                    <button
                      type="button"
                      className={styles.discardButton}
                      onClick={handleDiscardDraft}
                      disabled={!hasDraftChanges}
                    >
                      Discard Draft
                    </button>

                    <button
                      type="button"
                      className={styles.saveButton}
                      onClick={handleSaveScript}
                      disabled={!hasDraftChanges}
                    >
                      Save
                    </button>

                    <button type="button" className={styles.deleteButton} onClick={handleDeleteScript}>
                      Delete
                    </button>
                  </div>

                  {selectedScript.kind === 'trigger' && (
                    <div className={styles.triggerConfigRow}>
                      <label className={styles.configLabel}>
                        Event:
                        <select
                          className={styles.configSelect}
                          value={triggerEventName}
                          onChange={(e) => setTriggerEventName(e.target.value)}
                        >
                          {ROUTED_WINDOW_EVENTS.map((evt) => (
                            <option key={evt} value={evt}>
                              {evt}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.configLabel}>
                        Match text:
                        <input
                          type="text"
                          className={styles.configInput}
                          value={triggerMatchText}
                          onChange={(e) => setTriggerMatchText(e.target.value)}
                          placeholder="Text that should fire this trigger"
                        />
                      </label>

                      <label className={styles.configLabel}>
                        Test input
                        <input
                          type="text"
                          className={styles.configInput}
                          value={triggerTestInput}
                          onChange={(e) => setTriggerTestInput(e.target.value)}
                          placeholder="Simulated event payload"
                        />
                      </label>

                      <label className={`${styles.enabledToggle} ${styles.omitToggle}`}>
                        <input
                          type="checkbox"
                          checked={triggerOmitFromOutput}
                          onChange={(e) => setTriggerOmitFromOutput(e.target.checked)}
                        />
                        <span>Omit from output</span>
                      </label>
                    </div>
                  )}

                  {selectedScript.kind === 'alias' && (
                    <div className={styles.timerConfigRow}>
                      <label className={styles.configLabel}>
                        Game Input Command
                        <input
                          type="text"
                          className={styles.configInput}
                          value={aliasKey}
                          onChange={(e) => setAliasKey(e.target.value)}
                          placeholder="command to type"
                        />
                      </label>
                    </div>
                  )}

                  {selectedScript.kind === 'timer' && (
                    <div className={styles.timerConfigRow}>
                      <label className={styles.configLabel}>
                        Interval (seconds):
                        <input
                          type="number"
                          min={1}
                          className={styles.configInput}
                          value={timerIntervalSeconds}
                          onChange={(e) => setTimerIntervalSeconds(e.target.value)}
                        />
                      </label>
                    </div>
                  )}

                  <textarea
                    className={styles.editorTextarea}
                    value={editorSource}
                    onChange={(e) => setEditorSource(e.target.value)}
                    spellCheck={false}
                  />
                </>
              ) : (
                <div className={styles.emptyEditor}>Select a script or create a new one to edit.</div>
              )}
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className={styles.errorPanel}>
            <div className={styles.errorHeader}>
              Errors
              <button type="button" className={styles.clearErrorsButton} onClick={clearErrors}>
                Clear
              </button>
            </div>
            <div className={styles.errorList}>
              {errors.map((err) => (
                <div key={`${err.scriptId}-${err.timestamp}`} className={styles.errorItem}>
                  <div className={styles.errorTitle}>
                    [{err.kind}] {err.scriptName}
                  </div>
                  <div className={styles.errorMessage}>{err.message}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isSmallScreen && <div className={styles.resizeHandle} onMouseDown={handleResizeMouseDown} />}

        <ImportExportModal
          isOpen={ieOpen}
          mode={ieMode}
          onClose={() => setIeOpen(false)}
          connectionId={connectionId}
          scripts={scripts}
          onImport={handleImport}
        />
      </div>
    </div>
  );
};

export default UserScriptSandboxModal;
