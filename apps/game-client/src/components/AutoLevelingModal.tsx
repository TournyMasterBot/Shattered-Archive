// apps/game-client/src/components/AutoLevelingModal.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../styles/AutoLevelingModal.module.scss';

import type {
  AutoLevelConfig,
  AutoLevelRunState,
  AbilityThresholdRule,
  DesiredBuff,
} from '../features/autoleveling/autoleveling-types';
import { useAutoLeveling } from '../hooks/useAutoLeveling';

import { parseActionsFromEditor, serializeActionsToEditor } from '../features/autoleveling/autoleveling-actions';

type TabKey = 'setup' | 'configure';

type StepKey =
  | 'start.pre'
  | 'start.exec'
  | 'start.post'
  | 'move.pre'
  | 'move.exec'
  | 'move.post'
  | 'identify.pre'
  | 'identify.exec'
  | 'identify.post'
  | 'fight.pre'
  | 'fight.exec'
  | 'reset.endRound'
  | 'reset.wait';

interface AutoLevelingModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  isConnected: boolean;
}

function newId(): string {
  return crypto.randomUUID();
}

function toRunStateText(runState: AutoLevelRunState): string {
  switch (runState.status) {
    case 'idle':
      return 'Idle';
    case 'running':
      return `Running: round ${runState.round} • ${runState.step} • #${runState.actionIndex + 1}`;
    case 'stopping':
      return 'Stopping…';
    case 'error':
      return `Error: ${runState.message}`;
    default:
      return 'Idle';
  }
}

function buildStepEditors(config: AutoLevelConfig): Record<StepKey, string> {
  const s = config.steps;
  return {
    'start.pre': serializeActionsToEditor(s.start.pre),
    'start.exec': serializeActionsToEditor(s.start.exec),
    'start.post': serializeActionsToEditor(s.start.post),

    'move.pre': serializeActionsToEditor(s.move.pre),
    'move.exec': serializeActionsToEditor(s.move.exec),
    'move.post': serializeActionsToEditor(s.move.post),

    'identify.pre': serializeActionsToEditor(s.identify.pre),
    'identify.exec': serializeActionsToEditor(s.identify.exec),
    'identify.post': serializeActionsToEditor(s.identify.post),

    'fight.pre': serializeActionsToEditor(s.fight.pre),
    'fight.exec': serializeActionsToEditor(s.fight.exec),

    'reset.endRound': serializeActionsToEditor(s.reset.endRound),
    'reset.wait': serializeActionsToEditor(s.reset.wait),
  };
}

function applyEditors(base: AutoLevelConfig, stepEditors: Record<StepKey, string>): AutoLevelConfig {
  const get = (k: StepKey) => parseActionsFromEditor(stepEditors[k] ?? '');

  return {
    ...base,
    steps: {
      start: { pre: get('start.pre'), exec: get('start.exec'), post: get('start.post') },
      move: { pre: get('move.pre'), exec: get('move.exec'), post: get('move.post') },
      identify: { pre: get('identify.pre'), exec: get('identify.exec'), post: get('identify.post') },
      fight: { pre: get('fight.pre'), exec: get('fight.exec') },
      reset: { endRound: get('reset.endRound'), wait: get('reset.wait') },
    },
  };
}

export const AutoLevelingModal: React.FC<AutoLevelingModalProps> = ({ isOpen, onClose, connectionId, isConnected }) => {
  // ✅ Hooks must be unconditionally called, every render.
  const { config, setConfig, runState, socketReady, start, stop, resetToDefaults } = useAutoLeveling(connectionId);

  const [tab, setTab] = useState<TabKey>('setup');

  const [draft, setDraft] = useState<AutoLevelConfig>(() => config);
  const [stepEditors, setStepEditors] = useState<Record<StepKey, string>>(() => buildStepEditors(config));

  const runStateText = useMemo(() => toRunStateText(runState), [runState]);

  const hasChanges = useMemo(() => {
    // Apply editors before compare so “typed but not saved in textarea parsing” still counts as change.
    const appliedDraft = applyEditors(draft, stepEditors);
    return JSON.stringify(appliedDraft) !== JSON.stringify(config);
  }, [draft, stepEditors, config]);

  // When opening, re-sync local draft from persisted config.
  useEffect(() => {
    if (!isOpen) return;
    setDraft(config);
    setStepEditors(buildStepEditors(config));
    setTab('setup');
  }, [isOpen, config]);

  const save = useCallback(() => {
    const next = applyEditors(draft, stepEditors);
    setConfig(next);
  }, [draft, stepEditors, setConfig]);

  const discard = useCallback(() => {
    setDraft(config);
    setStepEditors(buildStepEditors(config));
  }, [config]);

  const updateBuff = useCallback((id: string, patch: Partial<DesiredBuff>) => {
    setDraft((prev) => ({
      ...prev,
      init: {
        ...prev.init,
        desiredBuffs: prev.init.desiredBuffs.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      },
    }));
  }, []);

  const addBuff = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      init: {
        ...prev.init,
        desiredBuffs: [...prev.init.desiredBuffs, { id: newId(), enabled: true, cmd: '' }],
      },
    }));
  }, []);

  const removeBuff = useCallback((id: string) => {
    setDraft((prev) => ({
      ...prev,
      init: {
        ...prev.init,
        desiredBuffs: prev.init.desiredBuffs.filter((b) => b.id !== id),
      },
    }));
  }, []);

  const updateRule = useCallback((id: string, patch: Partial<AbilityThresholdRule>) => {
    setDraft((prev) => ({
      ...prev,
      init: {
        ...prev.init,
        abilityThresholds: prev.init.abilityThresholds.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      },
    }));
  }, []);

  const addRule = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      init: {
        ...prev.init,
        abilityThresholds: [
          ...prev.init.abilityThresholds,
          { id: newId(), enabled: true, stat: 'hpPct', op: '>=', value: 80, cmd: '', throttle: 'once_per_fight' },
        ],
      },
    }));
  }, []);

  const removeRule = useCallback((id: string) => {
    setDraft((prev) => ({
      ...prev,
      init: {
        ...prev.init,
        abilityThresholds: prev.init.abilityThresholds.filter((r) => r.id !== id),
      },
    }));
  }, []);

  const canStart = useMemo(() => {
    // “Run” tab is gone per your rules, but we still compute availability for tooltip/state.
    return isConnected && socketReady && config.enabled;
  }, [isConnected, socketReady, config.enabled]);

  const editor = useCallback((key: StepKey, label: string) => {
    return (
      <div className={styles.phaseCard}>
        <div className={styles.phaseHeader}>
          <div className={styles.phaseTitle}>{label}</div>
          <div className={styles.phaseHeaderRight}>
            <button
              type="button"
              className={styles.inlineButton}
              onClick={() =>
                setStepEditors((prev) => ({ ...prev, [key]: (prev[key] ?? '') + (prev[key] ? '\n' : '') }))
              }
            >
              + Add line
            </button>
          </div>
        </div>

        <div className={styles.lines}>
          <textarea
            className={styles.textarea}
            value={stepEditors[key] ?? ''}
            onChange={(e) => setStepEditors((prev) => ({ ...prev, [key]: e.target.value }))}
            spellCheck={false}
          />
        </div>

        <div className={styles.help}>
          Lines: <code>wait_ms 500</code>, <code>wait_text You feel rested</code>, <code>wait_regex /^You slay/i</code>,
          otherwise sent as a command.
        </div>
      </div>
    );
  }, []);

  // ✅ After *all* hooks are declared, it’s safe to return null.
  if (!isOpen) return null;

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.title}>Auto Leveling</div>

          <div className={styles.headerRight}>
            <span className={styles.runState}>{runStateText}</span>
            <button type="button" className={styles.closeButton} onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'setup' ? styles.tabActive : ''}`}
            onClick={() => setTab('setup')}
          >
            Setup
          </button>

          <button
            type="button"
            className={`${styles.tab} ${tab === 'configure' ? styles.tabActive : ''}`}
            onClick={() => setTab('configure')}
          >
            Configure
          </button>

          <div className={styles.spacer} />

          <button type="button" className={styles.discardButton} disabled={!hasChanges} onClick={discard}>
            Discard
          </button>
          <button type="button" className={styles.saveButton} disabled={!hasChanges} onClick={save}>
            Save
          </button>
        </div>

        <div className={styles.body}>
          {tab === 'setup' ? (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>General</div>
                <div className={styles.sectionHeaderSub} />
              </div>

              <div className={styles.row}>
                <label className={styles.labelInline}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) => setDraft((p) => ({ ...p, enabled: e.target.checked }))}
                  />
                  Enabled
                </label>

                <label className={styles.labelInline}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={draft.loopRounds}
                    onChange={(e) => setDraft((p) => ({ ...p, loopRounds: e.target.checked }))}
                  />
                  Loop rounds
                </label>

                <label className={styles.labelInline}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={draft.fleePk}
                    onChange={(e) => setDraft((p) => ({ ...p, fleePk: e.target.checked }))}
                  />
                  Flee pk
                </label>
              </div>

              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Location</div>
                <div className={styles.sectionHeaderSub} />
              </div>

              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Desired buffs</div>
                <div className={styles.sectionHeaderSub}>Put key buffs here so you can verify they exist</div>
              </div>

              <div className={styles.list}>
                {draft.init.desiredBuffs.map((b) => (
                  <div key={b.id} className={styles.listRow}>
                    <input
                      className={styles.checkbox}
                      type="checkbox"
                      checked={b.enabled}
                      onChange={(e) => updateBuff(b.id, { enabled: e.target.checked })}
                    />
                    <input
                      className={styles.input}
                      value={b.cmd}
                      onChange={(e) => updateBuff(b.id, { cmd: e.target.value })}
                      placeholder="command (e.g. cast armor)"
                    />
                    <button type="button" className={styles.deleteSmall} onClick={() => removeBuff(b.id)}>
                      Delete
                    </button>
                  </div>
                ))}
                <button type="button" className={styles.addButton} onClick={addBuff}>
                  + Add buff
                </button>
              </div>

              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Fight Abilities</div>
                <div className={styles.sectionHeaderSub}>Threshold-driven commands during combat</div>
              </div>

              <div className={styles.list}>
                {draft.init.abilityThresholds.map((r) => (
                  <div key={r.id} className={styles.ruleRow}>
                    <input
                      className={styles.checkbox}
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) => updateRule(r.id, { enabled: e.target.checked })}
                    />

                    <select
                      className={styles.select}
                      value={r.stat}
                      onChange={(e) => updateRule(r.id, { stat: e.target.value as any })}
                    >
                      <option value="hpPct">hpPct</option>
                      <option value="mpPct">mpPct</option>
                      <option value="stamPct">stamPct</option>
                      <option value="hp">hp</option>
                      <option value="mp">mp</option>
                      <option value="stam">stam</option>
                    </select>

                    <select
                      className={styles.select}
                      value={r.op}
                      onChange={(e) => updateRule(r.id, { op: e.target.value as any })}
                    >
                      <option value=">=">{'>='}</option>
                      <option value=">">{'>'}</option>
                      <option value="<=">{'<='}</option>
                      <option value="<">{'<'}</option>
                    </select>

                    <input
                      className={styles.numInput}
                      type="number"
                      value={r.value}
                      onChange={(e) => updateRule(r.id, { value: Number(e.target.value) || 0 })}
                    />

                    <select
                      className={styles.select}
                      value={r.throttle}
                      onChange={(e) => updateRule(r.id, { throttle: e.target.value as any })}
                    >
                      <option value="none">none</option>
                      <option value="once_per_round">once_per_round</option>
                      <option value="once_per_fight">once_per_fight</option>
                    </select>

                    <input
                      className={styles.input}
                      value={r.cmd}
                      onChange={(e) => updateRule(r.id, { cmd: e.target.value })}
                      placeholder="command"
                    />

                    <button type="button" className={styles.deleteSmall} onClick={() => removeRule(r.id)}>
                      Delete
                    </button>
                  </div>
                ))}
                <button type="button" className={styles.addButton} onClick={addRule}>
                  + Add rule
                </button>
              </div>

              {/* Optional: if you want an action row here, keep it non-hook */}
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Controls</div>
                <div className={styles.sectionHeaderSub} />
              </div>

              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.inlineButton}
                  onClick={() => start()}
                  disabled={!canStart}
                  title={
                    !config.enabled
                      ? 'Enable Auto Leveling in the Game menu first'
                      : !socketReady
                        ? 'Socket not ready'
                        : !isConnected
                          ? 'Not connected'
                          : ''
                  }
                >
                  Start (debug)
                </button>

                <button type="button" className={styles.inlineButton} onClick={stop}>
                  Stop (debug)
                </button>

                <button type="button" className={styles.inlineButton} onClick={resetToDefaults}>
                  Reset defaults
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Configure steps</div>
                <div className={styles.sectionHeaderSub}>Each block matches your numbered workflow</div>
              </div>

              <div className={styles.row}>
                <label className={styles.label}>
                  Continent
                  <input
                    className={styles.input}
                    value={draft.init.continentId ?? ''}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, init: { ...p.init, continentId: e.target.value || null } }))
                    }
                    placeholder="continent id"
                  />
                </label>

                <label className={styles.label}>
                  Area
                  <input
                    className={styles.input}
                    value={draft.init.areaId ?? ''}
                    onChange={(e) => setDraft((p) => ({ ...p, init: { ...p.init, areaId: e.target.value || null } }))}
                    placeholder="area id"
                  />
                </label>

                <label className={styles.label}>
                  Training path
                  <input
                    className={styles.input}
                    value={draft.init.trainingPathId ?? ''}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, init: { ...p.init, trainingPathId: e.target.value || null } }))
                    }
                    placeholder="path id"
                  />
                </label>
              </div>

              <div className={styles.blockCard}>
                <div className={styles.blockHeader}>
                  <div className={styles.blockHeaderLeft}>
                    <div className={styles.blockNumber}>1</div>
                    <div className={styles.blockTitle}>Start</div>
                  </div>
                </div>
                <div className={styles.blockBody}>
                  {editor('start.pre', '1a. Pre-start')}
                  {editor('start.exec', '1b. Start')}
                  {editor('start.post', '1c. Post-start')}
                </div>
              </div>

              <div className={styles.blockCard}>
                <div className={styles.blockHeader}>
                  <div className={styles.blockHeaderLeft}>
                    <div className={styles.blockNumber}>2</div>
                    <div className={styles.blockTitle}>Move</div>
                  </div>
                </div>
                <div className={styles.blockBody}>
                  {editor('move.pre', '2a. Pre-move')}
                  {editor('move.exec', '2b. Move')}
                  {editor('move.post', '2c. Post-move')}
                </div>
              </div>

              <div className={styles.blockCard}>
                <div className={styles.blockHeader}>
                  <div className={styles.blockHeaderLeft}>
                    <div className={styles.blockNumber}>3</div>
                    <div className={styles.blockTitle}>Identify</div>
                  </div>
                </div>
                <div className={styles.blockBody}>
                  {editor('identify.pre', '3a. Pre-identify')}
                  {editor('identify.exec', '3b. Identify')}
                  {editor('identify.post', '3c. Post-identify')}
                </div>
              </div>

              <div className={styles.blockCard}>
                <div className={styles.blockHeader}>
                  <div className={styles.blockHeaderLeft}>
                    <div className={styles.blockNumber}>4</div>
                    <div className={styles.blockTitle}>Fight</div>
                  </div>
                </div>
                <div className={styles.blockBody}>
                  {editor('fight.pre', '4a. Pre-fight')}
                  {editor('fight.exec', '4b. Fight')}
                </div>
              </div>

              <div className={styles.blockCard}>
                <div className={styles.blockHeader}>
                  <div className={styles.blockHeaderLeft}>
                    <div className={styles.blockNumber}>5</div>
                    <div className={styles.blockTitle}>Reset</div>
                  </div>
                </div>
                <div className={styles.blockBody}>
                  {editor('reset.endRound', '5a. End round')}
                  {editor('reset.wait', '5b. Wait')}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutoLevelingModal;
