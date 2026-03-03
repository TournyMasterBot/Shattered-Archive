import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { ListenDomEvent } from '../features/event-emitter/event-dispatcher';
import { buildTriggerTree, filterScriptsByTagQuery, TriggerTreeNode } from '../features/userScripts/scriptListSearch';

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
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}${pad(d.getSeconds())}`;
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
  const group = (v as any).group;

  if (typeof id !== 'string' || id.trim().length === 0) return false;
  if (typeof name !== 'string') return false;
  if (typeof enabled !== 'boolean') return false;
  if (!isUserScriptLanguage(language)) return false;
  if (typeof source !== 'string') return false;
  if (!isUserScriptKind(kind)) return false;
  if (group !== undefined && typeof group !== 'string') return false;

  if (kind === 'trigger') {
    const eventName = (v as any).eventName;
    const matchText = (v as any).matchText;
    const dontRequireMatchText = (v as any).dontRequireMatchText;

    if (typeof eventName !== 'string') return false;
    if (typeof matchText !== 'string') return false;
    if (dontRequireMatchText !== undefined && typeof dontRequireMatchText !== 'boolean') return false;

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
    if ((parsed as any).schema !== 'shatteredArchive.export.v1') return { ok: false, error: 'Unsupported schema.' };
    if (!Array.isArray((parsed as any).items)) return { ok: false, error: 'Missing items array.' };

    const items: ExportFileV1['items'] = [];
    for (const it of (parsed as any).items) {
      if (!isObject(it)) return { ok: false, error: 'Invalid item shape.' };
      if ((it as any).storage !== 'localStorage') return { ok: false, error: 'Unsupported storage type.' };
      if ((it as any).format !== 'json') return { ok: false, error: 'Unsupported format.' };
      if ((it as any).kind !== 'userScripts') return { ok: false, error: 'Unsupported kind.' };
      if (typeof (it as any).key !== 'string' || (it as any).key.trim().length === 0)
        return { ok: false, error: 'Invalid key.' };
      if (!Array.isArray((it as any).value)) return { ok: false, error: 'Invalid value (expected array).' };

      const validScripts = (it as any).value.filter(isValidUserScript);

      items.push({
        storage: 'localStorage',
        key: (it as any).key,
        format: 'json',
        kind: 'userScripts',
        selection:
          isObject((it as any).selection) && Array.isArray(((it as any).selection as any).ids)
            ? { ids: ((it as any).selection as any).ids }
            : undefined,
        strategyHint: (it as any).strategyHint === 'mergeById' ? 'mergeById' : undefined,
        value: validScripts,
      });
    }

    const file: ExportFileV1 = {
      schema: 'shatteredArchive.export.v1',
      exportedAt: typeof (parsed as any).exportedAt === 'string' ? (parsed as any).exportedAt : nowIso(),
      app: typeof (parsed as any).app === 'string' ? (parsed as any).app : undefined,
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
        const hay =
          `${s.name} ${s.kind} ${s.id} ${(s as any).group ?? ''} ${s.kind === 'alias' ? (s as AliasScript).alias : ''}`.toLowerCase();
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
                placeholder="Search name / kind / alias / id / group"
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

                    {(s as any).group && (
                      <div className={styles.ieRowSub}>
                        group: <span className={styles.ieMono}>{String((s as any).group)}</span>
                      </div>
                    )}

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

  // globals + named variables (for "{NAME}" templates)
  const globalMgr = useGlobalScripts(connectionId);
  const namedVars = useUserVariables(connectionId);

  const [activeTab, setActiveTab] = useState<'triggers' | 'aliases' | 'timers' | 'globals' | 'variables'>('triggers');

  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [editorName, setEditorName] = useState<string>('');
  const [editorSource, setEditorSource] = useState<string>('');
  const [editorLanguage, setEditorLanguage] = useState<UserScriptLanguage>('text');

  // Trigger-specific state
  const [triggerEventName, setTriggerEventName] = useState<string>('shatteredarchive:raw-data');
  const [triggerMatchText, setTriggerMatchText] = useState<string>('');
  const [triggerGroup, setTriggerGroup] = useState<string>('');
  const [triggerTestInput, setTriggerTestInput] = useState<string>('');
  const [triggerOmitFromOutput, setTriggerOmitFromOutput] = useState<boolean>(false);

  // per-trigger option
  const [triggerDontRequireMatchText, setTriggerDontRequireMatchText] = useState<boolean>(false);

  // Alias-specific state
  const [aliasKey, setAliasKey] = useState<string>('');
  const [aliasGroup, setAliasGroup] = useState<string>('');

  // Timer-specific state
  const [timerIntervalSeconds, setTimerIntervalSeconds] = useState<string>('');
  const [timerGroup, setTimerGroup] = useState<string>('');

  // Import/Export modal state
  const [ieOpen, setIeOpen] = useState(false);
  const [ieMode, setIeMode] = useState<'export' | 'import'>('export');

  // Cosmetic list search + trigger tree UI state (no submit, no behavior changes)
  const [scriptSearchQuery, setScriptSearchQuery] = useState<string>('');
  const [expandedTriggerGroups, setExpandedTriggerGroups] = useState<Record<string, boolean>>({});

  // Drag/drop state for trigger tree organization
  const [draggingScriptId, setDraggingScriptId] = useState<string | null>(null);
  const [dragOverGroupPath, setDragOverGroupPath] = useState<string | null>(null);
  const [dragOverScriptId, setDragOverScriptId] = useState<string | null>(null);

  // Modal sizing
  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  });

  const [modalWidth, setModalWidth] = useState<number>(900);
  const [modalHeight, setModalHeight] = useState<number>(600);

  // Globals tab UI state
  const [globalLanguage, setGlobalLanguage] = useState<'javascript' | 'lua' | 'python' | 'typescript'>('javascript');
  const [globalDraft, setGlobalDraft] = useState<string>('');
  const [globalVarKey, setGlobalVarKey] = useState<string>('');
  const [globalVarValue, setGlobalVarValue] = useState<string>('');

  // Variables tab UI state
  const [namedVarKey, setNamedVarKey] = useState<string>('');
  const [namedVarValue, setNamedVarValue] = useState<string>('');

  // Track viewport size (HMR-safe)
  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      setIsSmallScreen(window.innerWidth <= 768);
    };

    // run once immediately
    handleResize();

    const offResize = ListenDomEvent<Event>('resize', () => handleResize(), {
      key: 'UserScriptSandboxModal:window:resize',
    });

    return () => {
      offResize();
    };
  }, []);

  // Reset all editor state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedScriptId(null);
      setEditorName('');
      setEditorSource('');
      setEditorLanguage('text');

      setTriggerEventName('shatteredarchive:raw-data');
      setTriggerMatchText('');
      setTriggerGroup('');
      setTriggerTestInput('');
      setTriggerOmitFromOutput(false);
      setTriggerDontRequireMatchText(false);

      setAliasKey('');
      setAliasGroup('');
      setTimerIntervalSeconds('');
      setTimerGroup('');
      setIeOpen(false);
      setIeMode('export');

      setGlobalLanguage('javascript');
      setGlobalDraft('');
      setGlobalVarKey('');
      setGlobalVarValue('');
      setNamedVarKey('');
      setNamedVarValue('');

      setScriptSearchQuery('');
      setExpandedTriggerGroups({});

      setDraggingScriptId(null);
      setDragOverGroupPath(null);
      setDragOverScriptId(null);
    }
  }, [isOpen]);

  // Reset selection when switching tabs
  useEffect(() => {
    setSelectedScriptId(null);
    setEditorName('');
    setEditorSource('');
    setEditorLanguage('text');

    setTriggerEventName('shatteredarchive:raw-data');
    setTriggerMatchText('');
    setTriggerGroup('');
    setTriggerTestInput('');
    setTriggerOmitFromOutput(false);
    setTriggerDontRequireMatchText(false);

    setAliasKey('');
    setAliasGroup('');
    setTimerIntervalSeconds('');
    setTimerGroup('');

    setDragOverGroupPath(null);
    setDragOverScriptId(null);
    setDraggingScriptId(null);
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
      ? ((selectedScript as TriggerScript).eventName ?? 'shatteredarchive:raw-data')
      : 'shatteredarchive:raw-data';

  const baseTriggerMatchText =
    selectedScript && selectedScript.kind === 'trigger' ? ((selectedScript as TriggerScript).matchText ?? '') : '';

  const baseTriggerGroup =
    selectedScript && selectedScript.kind === 'trigger' ? ((selectedScript as TriggerScript).group ?? '') : '';

  const baseTriggerOmitFromOutput =
    selectedScript && selectedScript.kind === 'trigger' ? !!(selectedScript as TriggerScript).omitFromOutput : false;

  const baseTriggerDontRequireMatchText =
    selectedScript && selectedScript.kind === 'trigger'
      ? !!(selectedScript as TriggerScript).dontRequireMatchText
      : false;

  const baseTimerIntervalSeconds =
    selectedScript && selectedScript.kind === 'timer'
      ? String(
          (selectedScript as TimerScript).intervalMs
            ? Math.round((selectedScript as TimerScript).intervalMs / 1000)
            : 5,
        )
      : '';

  const baseTimerGroup =
    selectedScript && selectedScript.kind === 'timer' ? ((selectedScript as TimerScript).group ?? '') : '';

  const baseAliasKey =
    selectedScript && selectedScript.kind === 'alias' ? ((selectedScript as AliasScript).alias ?? '') : '';

  const baseAliasGroup =
    selectedScript && selectedScript.kind === 'alias' ? ((selectedScript as AliasScript).group ?? '') : '';

  const hasDraftChanges =
    !!selectedScript &&
    (editorName !== selectedScript.name ||
      editorSource !== selectedScript.source ||
      editorLanguage !== selectedScript.language ||
      (selectedScript.kind === 'trigger' &&
        (triggerEventName !== baseTriggerEventName ||
          triggerMatchText !== baseTriggerMatchText ||
          triggerGroup !== baseTriggerGroup ||
          triggerOmitFromOutput !== baseTriggerOmitFromOutput ||
          triggerDontRequireMatchText !== baseTriggerDontRequireMatchText)) ||
      (selectedScript.kind === 'timer' &&
        (timerIntervalSeconds !== baseTimerIntervalSeconds || timerGroup !== baseTimerGroup)) ||
      (selectedScript.kind === 'alias' && (aliasKey !== baseAliasKey || aliasGroup !== baseAliasGroup)));

  const hasGlobalDraftChanges = (globalMgr.sources?.[globalLanguage] ?? '') !== (globalDraft ?? '');

  // Search/filter (cosmetic only) for script list panes
  const activeScriptKind: 'trigger' | 'alias' | 'timer' | null =
    activeTab === 'triggers' ? 'trigger' : activeTab === 'aliases' ? 'alias' : activeTab === 'timers' ? 'timer' : null;

  const filteredActiveScripts = useMemo(() => {
    if (!activeScriptKind) return [];
    const base = scriptsOfKind(activeScriptKind);
    return filterScriptsByTagQuery(base, scriptSearchQuery);
  }, [activeScriptKind, scripts, scriptSearchQuery]);

  const filteredTriggers = useMemo(
    () => filteredActiveScripts.filter((s): s is TriggerScript => s.kind === 'trigger'),
    [filteredActiveScripts],
  );

  const triggerTree = useMemo(() => buildTriggerTree(filteredTriggers), [filteredTriggers]);

  // Project aliases/timers into trigger-like structures for grouped display only (cosmetic)
  const groupedNonTriggerTree = useMemo(() => {
    if (activeTab !== 'aliases' && activeTab !== 'timers') return [];

    const projected = filteredActiveScripts.map((s) => {
      const asTriggerLike: TriggerScript = {
        id: s.id,
        kind: 'trigger',
        name: s.name,
        enabled: s.enabled,
        language: s.language,
        source: s.source,
        eventName: 'grouping-only',
        matchText: '',
        group: (s as any).group ?? '',
      };
      return asTriggerLike;
    });

    return buildTriggerTree(projected);
  }, [activeTab, filteredActiveScripts]);

  useEffect(() => {
    if (activeTab !== 'triggers' && activeTab !== 'aliases' && activeTab !== 'timers') return;

    const treeToUse = activeTab === 'triggers' ? triggerTree : groupedNonTriggerTree;

    setExpandedTriggerGroups((prev) => {
      const next: Record<string, boolean> = { ...prev };

      const visit = (nodes: TriggerTreeNode[]) => {
        for (const n of nodes) {
          if (next[n.path] === undefined) next[n.path] = true;
          if (n.children.length) visit(n.children);
        }
      };

      visit(treeToUse);
      return next;
    });
  }, [triggerTree, groupedNonTriggerTree, activeTab]);

  const toggleTriggerGroup = useCallback((path: string) => {
    setExpandedTriggerGroups((prev) => ({ ...prev, [path]: !prev[path] }));
  }, []);

  const expandCollapseAllTriggerGroups = useCallback(
    (expanded: boolean) => {
      const treeToUse = activeTab === 'triggers' ? triggerTree : groupedNonTriggerTree;

      setExpandedTriggerGroups((prev) => {
        const next: Record<string, boolean> = { ...prev };
        const visit = (nodes: TriggerTreeNode[]) => {
          for (const n of nodes) {
            next[n.path] = expanded;
            if (n.children.length) visit(n.children);
          }
        };
        visit(treeToUse);
        return next;
      });
    },
    [activeTab, triggerTree, groupedNonTriggerTree],
  );

  const clearDragUi = useCallback(() => {
    setDraggingScriptId(null);
    setDragOverGroupPath(null);
    setDragOverScriptId(null);
  }, []);

  const moveScriptInArray = useCallback(
    (scriptId: string, targetScriptId: string) => {
      if (scriptId === targetScriptId) return;

      const current = [...scripts];
      const fromIndex = current.findIndex((s) => s.id === scriptId);
      const toIndex = current.findIndex((s) => s.id === targetScriptId);

      if (fromIndex < 0 || toIndex < 0) return;

      const [moved] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, moved);

      replaceAllScripts(current);
    },
    [scripts, replaceAllScripts],
  );

  const moveTriggerToGroup = useCallback(
    (scriptId: string, targetGroupPath: string) => {
      const current = [...scripts];
      const idx = current.findIndex((s) => s.id === scriptId);
      if (idx < 0) return;

      const script = current[idx];
      if (!script || script.kind !== 'trigger') return;

      const updated: TriggerScript = {
        ...(script as TriggerScript),
        group: targetGroupPath === 'Ungrouped' ? '' : targetGroupPath,
      };

      current[idx] = updated;
      replaceAllScripts(current);

      // keep editor in sync if current trigger is selected
      if (selectedScriptId === scriptId) {
        setTriggerGroup(updated.group ?? '');
      }
    },
    [scripts, replaceAllScripts, selectedScriptId],
  );

  const reorderTriggerWithinGroupNearTarget = useCallback(
    (draggedId: string, targetId: string) => {
      const dragged = scripts.find((s) => s.id === draggedId);
      const target = scripts.find((s) => s.id === targetId);

      if (!dragged || !target) return;
      if (dragged.kind !== 'trigger' || target.kind !== 'trigger') return;

      // First align group to target's group, then reorder array
      const targetGroup = (target as TriggerScript).group ?? '';
      moveTriggerToGroup(draggedId, targetGroup || 'Ungrouped');
      moveScriptInArray(draggedId, targetId);
    },
    [scripts, moveTriggerToGroup, moveScriptInArray],
  );

  // Generic drag/drop helpers for alias + timer (group-aware + reorder)
  const moveNonTriggerToGroup = useCallback(
    (scriptId: string, kind: 'alias' | 'timer', targetGroupPath: string) => {
      const current = [...scripts];
      const idx = current.findIndex((s) => s.id === scriptId);
      if (idx < 0) return;

      const script = current[idx];
      if (!script || script.kind !== kind) return;

      const normalizedGroup = targetGroupPath === 'Ungrouped' ? '' : targetGroupPath;
      const updated = { ...(script as any), group: normalizedGroup } as AnyUserScript;

      current[idx] = updated;
      replaceAllScripts(current);

      // Keep active editor field in sync
      if (selectedScriptId === scriptId) {
        if (kind === 'alias') setAliasGroup(normalizedGroup);
        if (kind === 'timer') setTimerGroup(normalizedGroup);
      }
    },
    [scripts, replaceAllScripts, selectedScriptId],
  );

  const reorderNonTriggerWithinGroupNearTarget = useCallback(
    (draggedId: string, targetId: string, kind: 'alias' | 'timer') => {
      const dragged = scripts.find((s) => s.id === draggedId);
      const target = scripts.find((s) => s.id === targetId);

      if (!dragged || !target) return;
      if (dragged.kind !== kind || target.kind !== kind) return;

      const targetGroup = ((target as any).group ?? '') as string;
      moveNonTriggerToGroup(draggedId, kind, targetGroup || 'Ungrouped');
      moveScriptInArray(draggedId, targetId);
    },
    [scripts, moveNonTriggerToGroup, moveScriptInArray],
  );

  const activeDndKind =
    activeTab === 'triggers' ? 'trigger' : activeTab === 'aliases' ? 'alias' : activeTab === 'timers' ? 'timer' : null;

  const sortTreeNodesAlpha = useCallback((nodes: TriggerTreeNode[]): TriggerTreeNode[] => {
    return [...nodes].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, []);

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
      setTriggerEventName(trig.eventName ?? 'shatteredarchive:raw-data');
      setTriggerMatchText(trig.matchText ?? '');
      setTriggerGroup(trig.group ?? '');
      setTriggerOmitFromOutput(!!trig.omitFromOutput);
      setTriggerDontRequireMatchText(!!trig.dontRequireMatchText);

      setAliasKey('');
      setAliasGroup('');
      setTimerIntervalSeconds('');
      setTimerGroup('');
    } else if (script.kind === 'timer') {
      const t = script as TimerScript;
      const secs = t.intervalMs ? Math.round(t.intervalMs / 1000) : 5;

      setTimerIntervalSeconds(String(secs));
      setTimerGroup(t.group ?? '');

      setTriggerEventName('shatteredarchive:raw-data');
      setTriggerMatchText('');
      setTriggerGroup('');
      setTriggerOmitFromOutput(false);
      setTriggerDontRequireMatchText(false);

      setAliasKey('');
      setAliasGroup('');
    } else if (script.kind === 'alias') {
      const a = script as AliasScript;
      setAliasKey(a.alias ?? '');
      setAliasGroup(a.group ?? '');

      setTriggerEventName('shatteredarchive:raw-data');
      setTriggerMatchText('');
      setTriggerGroup('');
      setTriggerOmitFromOutput(false);
      setTriggerDontRequireMatchText(false);

      setTimerIntervalSeconds('');
      setTimerGroup('');
    } else {
      setTriggerEventName('shatteredarchive:raw-data');
      setTriggerMatchText('');
      setTriggerGroup('');
      setTriggerOmitFromOutput(false);
      setTriggerDontRequireMatchText(false);

      setAliasKey('');
      setAliasGroup('');
      setTimerIntervalSeconds('');
      setTimerGroup('');
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
        eventName: 'shatteredarchive:raw-data',
        matchText: '',
        group: '',
        omitFromOutput: false,
        dontRequireMatchText: false,
      });

      handleSelectScript(s);
      setActiveTab('triggers');
    } else if (activeTab === 'aliases') {
      const s = createAlias({
        name: 'New Alias',
        alias: 'l',
        group: '',
        enabled: false,
        language: 'text',
        source: `look`,
      });
      handleSelectScript(s);
      setActiveTab('aliases');
    } else if (activeTab === 'timers') {
      const s = createTimer({
        name: 'New Timer',
        group: '',
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
      trig.eventName = triggerEventName || 'shatteredarchive:raw-data';
      trig.matchText = triggerMatchText || '';
      trig.group = triggerGroup.trim();
      trig.omitFromOutput = !!triggerOmitFromOutput;
      trig.dontRequireMatchText = !!triggerDontRequireMatchText;
    } else if (updated.kind === 'timer') {
      const secs = Number(timerIntervalSeconds);
      const clampedSecs = Number.isFinite(secs) && secs > 0 ? secs : 5;
      const t = updated as TimerScript;
      t.intervalMs = clampedSecs * 1000;
      t.group = timerGroup.trim();
    } else if (updated.kind === 'alias') {
      const a = updated as AliasScript;
      a.alias = aliasKey || '';
      a.group = aliasGroup.trim();
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
      setTriggerGroup(baseTriggerGroup);
      setTriggerOmitFromOutput(baseTriggerOmitFromOutput);
      setTriggerDontRequireMatchText(baseTriggerDontRequireMatchText);
    } else if (selectedScript.kind === 'timer') {
      setTimerIntervalSeconds(baseTimerIntervalSeconds);
      setTimerGroup(baseTimerGroup);
    } else if (selectedScript.kind === 'alias') {
      setAliasKey(baseAliasKey);
      setAliasGroup(baseAliasGroup);
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

    setTriggerEventName('shatteredarchive:raw-data');
    setTriggerMatchText('');
    setTriggerGroup('');
    setTriggerTestInput('');
    setTriggerOmitFromOutput(false);
    setTriggerDontRequireMatchText(false);

    setAliasKey('');
    setAliasGroup('');
    setTimerIntervalSeconds('');
    setTimerGroup('');
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
      trig.eventName = triggerEventName || 'shatteredarchive:raw-data';
      trig.matchText = triggerMatchText || '';
      trig.group = triggerGroup.trim();
      trig.omitFromOutput = !!triggerOmitFromOutput;
      trig.dontRequireMatchText = !!triggerDontRequireMatchText;
    } else if (draft.kind === 'timer') {
      const secs = Number(timerIntervalSeconds);
      const clampedSecs = Number.isFinite(secs) && secs > 0 ? secs : 5;
      const t = draft as TimerScript;
      t.intervalMs = clampedSecs * 1000;
      t.group = timerGroup.trim();
    } else if (draft.kind === 'alias') {
      const a = draft as AliasScript;
      a.alias = aliasKey || '';
      a.group = aliasGroup.trim();
    }

    const apiExtras =
      draft.kind === 'trigger'
        ? {
            event: {
              name: triggerEventName || 'shatteredarchive:raw-data',
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

  const renderScriptListButton = (script: AnyUserScript, indentPx = 0) => {
    const dndKindForThisScript =
      script.kind === 'trigger' || script.kind === 'alias' || script.kind === 'timer' ? script.kind : null;
    const isDraggable = dndKindForThisScript !== null && activeDndKind === dndKindForThisScript;
    const isDragOverScript = dragOverScriptId === script.id && draggingScriptId && draggingScriptId !== script.id;

    return (
      <button
        key={script.id}
        type="button"
        className={`${styles.scriptItem} ${selectedScriptId === script.id ? styles.scriptItemActive : ''}`}
        onClick={() => handleSelectScript(script)}
        style={
          {
            ...(indentPx ? { paddingLeft: `${indentPx}px` } : {}),
            ...(isDragOverScript
              ? {
                  outline: '1px dashed rgba(255,255,255,0.35)',
                  outlineOffset: '-2px',
                }
              : {}),
            ...(draggingScriptId === script.id
              ? {
                  opacity: 0.6,
                }
              : {}),
          } as React.CSSProperties
        }
        title={script.id}
        draggable={isDraggable}
        onDragStart={(e) => {
          if (!isDraggable) return;
          setDraggingScriptId(script.id);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', script.id);
        }}
        onDragEnd={() => {
          clearDragUi();
        }}
        onDragOver={(e) => {
          if (!isDraggable) return;
          if (!draggingScriptId || draggingScriptId === script.id) return;

          const dragged = scripts.find((s) => s.id === draggingScriptId);
          if (!dragged || dragged.kind !== script.kind) return;

          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDragOverScriptId(script.id);
          setDragOverGroupPath(null);
        }}
        onDragLeave={() => {
          if (dragOverScriptId === script.id) setDragOverScriptId(null);
        }}
        onDrop={(e) => {
          if (!isDraggable) return;
          e.preventDefault();
          e.stopPropagation();

          const draggedId = draggingScriptId || e.dataTransfer.getData('text/plain');
          if (!draggedId || draggedId === script.id) {
            clearDragUi();
            return;
          }

          if (script.kind === 'trigger') {
            reorderTriggerWithinGroupNearTarget(draggedId, script.id);
          } else if (script.kind === 'alias') {
            reorderNonTriggerWithinGroupNearTarget(draggedId, script.id, 'alias');
          } else if (script.kind === 'timer') {
            reorderNonTriggerWithinGroupNearTarget(draggedId, script.id, 'timer');
          }

          clearDragUi();
        }}
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
    );
  };

  function countTreeNodeScripts(node: TriggerTreeNode): number {
    return node.scripts.length + node.children.reduce((acc, child) => acc + countTreeNodeScripts(child), 0);
  }

  const renderGenericGroupTreeNodes = (
    nodes: TriggerTreeNode[],
    kind: 'triggers' | 'aliases' | 'timers',
    depth = 0,
  ): React.ReactNode[] => {
    const out: React.ReactNode[] = [];

    for (const node of sortTreeNodesAlpha(nodes)) {
      const isExpanded = expandedTriggerGroups[node.path] !== false;
      const totalCount = countTreeNodeScripts(node);
      const expectedScriptKind = kind === 'triggers' ? 'trigger' : kind === 'aliases' ? 'alias' : 'timer';
      const isDragOverGroup = dragOverGroupPath === node.path && !!draggingScriptId;

      out.push(
        <button
          key={`${kind}:group:${node.path}`}
          type="button"
          className={styles.scriptItem}
          onClick={() => toggleTriggerGroup(node.path)}
          style={{
            paddingLeft: `${10 + depth * 14}px`,
            fontWeight: 600,
            opacity: 0.95,
            ...(isDragOverGroup
              ? {
                  outline: '1px dashed rgba(255,255,255,0.35)',
                  outlineOffset: '-2px',
                  background: 'rgba(255,255,255,0.05)',
                }
              : {}),
          }}
          title={`${node.path} (drop ${expectedScriptKind} here to move group)`}
          onDragOver={(e) => {
            if (!draggingScriptId) return;
            const dragged = scripts.find((s) => s.id === draggingScriptId);
            if (!dragged || dragged.kind !== expectedScriptKind) return;

            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDragOverGroupPath(node.path);
            setDragOverScriptId(null);
          }}
          onDragLeave={() => {
            if (dragOverGroupPath === node.path) setDragOverGroupPath(null);
          }}
          onDrop={(e) => {
            if (!draggingScriptId) return;
            e.preventDefault();
            e.stopPropagation();

            const dragged = scripts.find((s) => s.id === draggingScriptId);
            if (!dragged || dragged.kind !== expectedScriptKind) {
              clearDragUi();
              return;
            }

            if (expectedScriptKind === 'trigger') {
              moveTriggerToGroup(draggingScriptId, node.path);
            } else if (expectedScriptKind === 'alias') {
              moveNonTriggerToGroup(draggingScriptId, 'alias', node.path);
            } else if (expectedScriptKind === 'timer') {
              moveNonTriggerToGroup(draggingScriptId, 'timer', node.path);
            }

            clearDragUi();
          }}
        >
          <span className={styles.scriptName}>
            {isExpanded ? '▾' : '▸'} {node.label}
          </span>
          <span className={styles.scriptDisabled}>· {totalCount}</span>
        </button>,
      );

      if (!isExpanded) continue;

      if (node.children.length) {
        out.push(...renderGenericGroupTreeNodes(sortTreeNodesAlpha(node.children), kind, depth + 1));
      }

      if (node.scripts.length) {
        for (const pseudo of node.scripts) {
          const actual = scripts.find((s) => s.id === pseudo.id);
          if (!actual) continue;
          out.push(renderScriptListButton(actual, 20 + (depth + 1) * 14));
        }
      }
    }

    return out;
  };

  const renderTriggerTreeNodes = (nodes: TriggerTreeNode[], depth = 0): React.ReactNode[] => {
    return renderGenericGroupTreeNodes(sortTreeNodesAlpha(nodes), 'triggers', depth);
  };

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
              <div style={{ padding: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <input
                  type="text"
                  value={scriptSearchQuery}
                  onChange={(e) => setScriptSearchQuery(e.target.value)}
                  placeholder="Filter (live). Tags: kind:, name:, event:, match:, group:, alias:, language:, enabled:, disabled:"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '6px 8px',
                    borderRadius: 4,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(0,0,0,0.2)',
                    color: 'inherit',
                  }}
                />

                {((activeTab === 'triggers' && triggerTree.length > 0) ||
                  ((activeTab === 'aliases' || activeTab === 'timers') && groupedNonTriggerTree.length > 0)) && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={styles.ieSmallButton}
                      onClick={() => expandCollapseAllTriggerGroups(true)}
                    >
                      Expand all
                    </button>
                    <button
                      type="button"
                      className={styles.ieSmallButton}
                      onClick={() => expandCollapseAllTriggerGroups(false)}
                    >
                      Collapse all
                    </button>
                  </div>
                )}
              </div>

              {activeTab === 'triggers' ? (
                triggerTree.length > 0 ? (
                  renderTriggerTreeNodes(sortTreeNodesAlpha(triggerTree))
                ) : (
                  <div className={styles.emptyEditor} style={{ padding: 10 }}>
                    No triggers match the current filter.
                  </div>
                )
              ) : activeTab === 'aliases' || activeTab === 'timers' ? (
                groupedNonTriggerTree.length > 0 ? (
                  renderGenericGroupTreeNodes(sortTreeNodesAlpha(groupedNonTriggerTree), activeTab)
                ) : (
                  <div className={styles.emptyEditor} style={{ padding: 10 }}>
                    No scripts match the current filter.
                  </div>
                )
              ) : filteredActiveScripts.length > 0 ? (
                filteredActiveScripts.map((script) => renderScriptListButton(script))
              ) : (
                <div className={styles.emptyEditor} style={{ padding: 10 }}>
                  No scripts match the current filter.
                </div>
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

                      {/* toggle group is anchored to the right */}
                      <div className={styles.triggerToggleGroup}>
                        <label className={styles.configLabel} style={{ minWidth: 220 }}>
                          <input
                            type="text"
                            className={styles.configInput}
                            value={triggerGroup}
                            onChange={(e) => setTriggerGroup(e.target.value)}
                            placeholder="group"
                            title='Cosmetic tree grouping. Supports "/", "\\", ">", "::"'
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

                        <label className={`${styles.enabledToggle} ${styles.omitToggle}`}>
                          <input
                            type="checkbox"
                            checked={triggerDontRequireMatchText}
                            onChange={(e) => setTriggerDontRequireMatchText(e.target.checked)}
                          />
                          <span>Don’t require match text</span>
                        </label>
                      </div>
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

                      <label className={styles.configLabel} style={{ minWidth: 220 }}>
                        Group
                        <input
                          type="text"
                          className={styles.configInput}
                          value={aliasGroup}
                          onChange={(e) => setAliasGroup(e.target.value)}
                          placeholder="group"
                          title='Cosmetic tree grouping. Supports "/", "\\", ">", "::"'
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

                      <label className={styles.configLabel} style={{ minWidth: 220 }}>
                        Group
                        <input
                          type="text"
                          className={styles.configInput}
                          value={timerGroup}
                          onChange={(e) => setTimerGroup(e.target.value)}
                          placeholder="group"
                          title='Cosmetic tree grouping. Supports "/", "\\", ">", "::"'
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
