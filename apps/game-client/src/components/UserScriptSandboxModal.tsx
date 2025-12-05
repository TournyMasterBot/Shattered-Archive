// apps/game-client/src/components/UserScriptSandboxModal.tsx
import React, { useState, useEffect } from 'react';
import { useUserScriptSandbox } from '../hooks/useUserScriptSandbox';
import {
  AnyUserScript,
  TimerScript,
  TriggerScript,
  AliasScript,
  UserScriptLanguage,
} from '../features/userScripts/types';
import styles from '../styles/UserScriptSandboxModal.module.scss';

interface UserScriptSandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Desktop resize limits
const MIN_WIDTH = 700;
const MAX_WIDTH = 1400;
const MIN_HEIGHT = 400;
const MAX_HEIGHT = 900;

export const UserScriptSandboxModal: React.FC<UserScriptSandboxModalProps> = ({ isOpen, onClose }) => {
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
  } = useUserScriptSandbox();

  const [activeTab, setActiveTab] = useState<'triggers' | 'aliases' | 'timers'>('triggers');

  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [editorName, setEditorName] = useState<string>('');
  const [editorSource, setEditorSource] = useState<string>('');
  const [editorLanguage, setEditorLanguage] = useState<UserScriptLanguage>('javascript');

  // Trigger-specific state
  const [triggerEventName, setTriggerEventName] = useState<string>('example:event');
  const [triggerMatchText, setTriggerMatchText] = useState<string>('');
  const [triggerTestInput, setTriggerTestInput] = useState<string>('');

  // Alias-specific state
  const [aliasKey, setAliasKey] = useState<string>('');

  // Timer-specific state
  const [timerIntervalSeconds, setTimerIntervalSeconds] = useState<string>('');

  // Modal sizing
  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  });

  const [modalWidth, setModalWidth] = useState<number>(900);
  const [modalHeight, setModalHeight] = useState<number>(600);

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
      setEditorLanguage('javascript');
      setTriggerEventName('example:event');
      setTriggerMatchText('');
      setTriggerTestInput('');
      setAliasKey('');
      setTimerIntervalSeconds('');
    }
  }, [isOpen]);

  // Reset selection when switching tabs
  useEffect(() => {
    setSelectedScriptId(null);
    setEditorName('');
    setEditorSource('');
    setEditorLanguage('javascript');
    setTriggerEventName('example:event');
    setTriggerMatchText('');
    setTriggerTestInput('');
    setAliasKey('');
    setTimerIntervalSeconds('');
  }, [activeTab]);

  // ------------- Derived values -------------

  const scriptsOfKind = (kind: 'trigger' | 'alias' | 'timer') => scripts.filter((s) => s.kind === kind);

  const selectedScript: AnyUserScript | undefined = selectedScriptId
    ? scripts.find((s) => s.id === selectedScriptId)
    : undefined;

  const baseTriggerEventName =
    selectedScript && selectedScript.kind === 'trigger'
      ? ((selectedScript as TriggerScript).eventName ?? 'example:event')
      : 'example:event';

  const baseTriggerMatchText =
    selectedScript && selectedScript.kind === 'trigger' ? ((selectedScript as TriggerScript).matchText ?? '') : '';

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
        (triggerEventName !== baseTriggerEventName || triggerMatchText !== baseTriggerMatchText)) ||
      (selectedScript.kind === 'timer' && timerIntervalSeconds !== baseTimerIntervalSeconds) ||
      (selectedScript.kind === 'alias' && aliasKey !== baseAliasKey));

  // Make sure hooks are all declared above this line
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
      setTriggerEventName(trig.eventName ?? 'example:event');
      setTriggerMatchText(trig.matchText ?? '');
      setAliasKey('');
      setTimerIntervalSeconds('');
    } else if (script.kind === 'timer') {
      const t = script as TimerScript;
      const secs = t.intervalMs ? Math.round(t.intervalMs / 1000) : 5;
      setTimerIntervalSeconds(String(secs));
      setTriggerEventName('example:event');
      setTriggerMatchText('');
      setAliasKey('');
    } else if (script.kind === 'alias') {
      const a = script as AliasScript;
      setAliasKey(a.alias ?? '');
      setTriggerEventName('example:event');
      setTriggerMatchText('');
      setTimerIntervalSeconds('');
    } else {
      setTriggerEventName('example:event');
      setTriggerMatchText('');
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
        language: 'javascript',
        source: `// Trigger example
log("Trigger fired");
sendCommand("say Hello from trigger");`,
        eventName: 'example:event',
        matchText: '',
      });
      handleSelectScript(s);
      setActiveTab('triggers');
    } else if (activeTab === 'aliases') {
      const s = createAlias({
        name: 'New Alias',
        alias: 'l',
        enabled: false,
        language: 'javascript',
        source: `log("Alias executed")`,
      });
      handleSelectScript(s);
      setActiveTab('aliases');
    } else {
      const s = createTimer({
        name: 'New Timer',
        enabled: false,
        language: 'javascript',
        source: `// Timer example
log("Timer fired");
sendCommand("score");`,
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
      trig.eventName = triggerEventName || 'example:event';
      trig.matchText = triggerMatchText || '';
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
    setEditorLanguage('javascript');
    setTriggerEventName('example:event');
    setTriggerMatchText('');
    setTriggerTestInput('');
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
      trig.eventName = triggerEventName || 'example:event';
      trig.matchText = triggerMatchText || '';
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
              name: triggerEventName || 'example:event',
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

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal} style={modalStyle}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.title}>User Script Sandbox</div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Tabs */}
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
          <button type="button" className={styles.newButton} onClick={handleNewScript}>
            + New
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Left list */}
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

          {/* Right editor */}
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

                  {/* Language selector */}
                  <label className={styles.languageLabel}>
                    <select
                      className={styles.languageSelect}
                      value={editorLanguage}
                      onChange={(e) => setEditorLanguage(e.target.value as UserScriptLanguage)}
                    >
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

                {/* Trigger configuration */}
                {selectedScript.kind === 'trigger' && (
                  <div className={styles.triggerConfigRow}>
                    <label className={styles.configLabel}>
                      Event:
                      <select
                        className={styles.configSelect}
                        value={triggerEventName}
                        onChange={(e) => setTriggerEventName(e.target.value)}
                      >
                        <option value="text:line">text:line</option>
                        <option value="gmcp:room">gmcp:room</option>
                        <option value="gmcp:affects">gmcp:affects</option>
                        <option value="example:event">example:event</option>
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
                  </div>
                )}

                {/* Alias configuration */}
                {selectedScript.kind === 'alias' && (
                  <div className={styles.timerConfigRow}>
                    <label className={styles.configLabel}>
                      Alias key
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

                {/* Timer configuration */}
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

        {/* Errors */}
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

        {/* Desktop-only resize handle */}
        {!isSmallScreen && <div className={styles.resizeHandle} onMouseDown={handleResizeMouseDown} />}
      </div>
    </div>
  );
};

export default UserScriptSandboxModal;
