// apps/game-client/src/components/wizard/TargetsStep.tsx

import React, { useState } from 'react';

import styles from '../../styles/AutoLevelingWizard.module.scss';
import {
  MAX_TARGET_TEXT,
  isSafeTargetText,
  targetOverrideKey,
  type UnmatchedOverride,
} from '../../features/autoleveling/autoleveling-target-overrides';
import HelpInfoButton from '../HelpInfoButton';
import TargetsHelp from './TargetsHelp';
import { targetRowId, type DraftTarget } from './useWizardDraft';

interface Props {
  areaName: string | null;
  targets: DraftTarget[];
  /** The player's edits whose area target is no longer in the served list. */
  unmatched: UnmatchedOverride[];
  loading: boolean;
  /** `rid` is the row's `targetRowId` (the room line changes when it is edited). */
  onToggle: (rid: string, enabled: boolean) => void;
  onAddCustom: (t: { lookName: string; engageName: string }) => void;
  onRemoveCustom: (rid: string) => void;
  /** Saves an edit; resolves with a message to show when it could not be saved, or null on success. */
  onEdit: (rid: string, next: { lookName: string; engageName: string }) => Promise<string | null>;
  onHide: (rid: string) => void;
  onRestore: (rid: string) => void;
  onReset: (rid: string) => void;
  onDeleteUnmatched: (recordId: string) => void;
}

/** Why a room line or keyword cannot be used, in words for the player; null when it is fine. */
function textProblem(what: string, text: string): string | null {
  if (text.length === 0) return `The ${what} cannot be empty.`;
  if (text.length > MAX_TARGET_TEXT) return `The ${what} can have at most ${MAX_TARGET_TEXT} characters.`;
  if (!isSafeTargetText(text)) return `The ${what} cannot contain ";" or line breaks.`;
  return null;
}

export const TargetsStep: React.FC<Props> = ({
  areaName,
  targets,
  unmatched,
  loading,
  onToggle,
  onAddCustom,
  onRemoveCustom,
  onEdit,
  onHide,
  onRestore,
  onReset,
  onDeleteUnmatched,
}) => {
  const [look, setLook] = useState('');
  const [engage, setEngage] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingRid, setEditingRid] = useState<string | null>(null);
  const [editLook, setEditLook] = useState('');
  const [editEngage, setEditEngage] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submitCustom = () => {
    const l = look.trim();
    const e = engage.trim();
    if (!l || !e) return;
    const problem = textProblem('room line', l) ?? textProblem('kill keyword', e);
    if (problem) {
      setAddError(problem);
      return;
    }
    const newKey = targetOverrideKey(l);
    if (targets.some((o) => targetOverrideKey(o.lookName) === newKey || o.key === newKey)) {
      setAddError('Another target already uses that room line.');
      return;
    }
    setAddError(null);
    onAddCustom({ lookName: l, engageName: e });
    setLook('');
    setEngage('');
  };

  const startEdit = (t: DraftTarget) => {
    setEditingRid(targetRowId(t));
    setEditLook(t.lookName);
    setEditEngage(t.engageName);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingRid(null);
    setEditError(null);
  };

  const saveEdit = async (rid: string) => {
    const l = editLook.trim();
    const e = editEngage.trim();
    const problem = textProblem('room line', l) ?? textProblem('kill keyword', e);
    if (problem) {
      setEditError(problem);
      return;
    }
    const newKey = targetOverrideKey(l);
    const clash = targets.some(
      (o) => targetRowId(o) !== rid && (targetOverrideKey(o.lookName) === newKey || o.key === newKey),
    );
    if (clash) {
      setEditError('Another target already uses that room line.');
      return;
    }
    setSaving(true);
    try {
      const failure = await onEdit(rid, { lookName: l, engageName: e });
      if (failure) setEditError(failure);
      else cancelEdit();
    } finally {
      setSaving(false);
    }
  };

  if (!areaName) {
    return <div className={styles.notice}>Pick an area first — its recommended targets load here.</div>;
  }

  if (showHelp) return <TargetsHelp onBack={() => setShowHelp(false)} />;

  const shown = targets.filter((t) => !t.hidden);
  const hidden = targets.filter((t) => t.hidden);
  const enabledCount = shown.filter((t) => t.enabled).length;
  const areaTargets = shown.filter((t) => t.origin === 'area');
  const customTargets = shown.filter((t) => t.origin === 'custom');

  const renderEditor = (t: DraftTarget, rid: string) => (
    <div className={styles.editRow} role="group" aria-label={`Edit ${t.lookName}`}>
      <input
        className={styles.input}
        type="text"
        aria-label="Room line"
        value={editLook}
        onChange={(e) => setEditLook(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void saveEdit(rid);
          if (e.key === 'Escape') {
            e.stopPropagation(); // cancels the row edit only; the window around it stays
            cancelEdit();
          }
        }}
      />
      <input
        className={styles.inputNarrow}
        type="text"
        aria-label="Kill keyword"
        value={editEngage}
        onChange={(e) => setEditEngage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void saveEdit(rid);
          if (e.key === 'Escape') {
            e.stopPropagation(); // cancels the row edit only; the window around it stays
            cancelEdit();
          }
        }}
      />
      <button type="button" className={styles.button} onClick={() => void saveEdit(rid)} disabled={saving}>
        Save
      </button>
      <button type="button" className={styles.button} onClick={cancelEdit} disabled={saving}>
        Cancel
      </button>
      {editError && (
        <div className={styles.fieldError} role="alert">
          {editError}
        </div>
      )}
    </div>
  );

  const renderRow = (t: DraftTarget) => {
    const rid = targetRowId(t);
    const editing = editingRid === rid;
    return (
      <li key={rid} className={styles.targetItem}>
        {editing ? (
          renderEditor(t, rid)
        ) : (
          <div className={styles.targetRow}>
            <label className={styles.targetCheck}>
              <input
                type="checkbox"
                checked={t.enabled}
                onChange={(e) => onToggle(rid, e.target.checked)}
                aria-label={`Fight ${t.lookName}`}
              />
              <span className={styles.targetLook}>{t.lookName}</span>
              {t.overridden && <span className={styles.editedBadge}>edited</span>}
            </label>
            <span className={styles.targetMeta}>
              {t.level != null && <span className={styles.targetLevel}>L{t.level}</span>}
              <code>{t.engageName}</code>
              <button
                type="button"
                className={`${styles.linkButton} ${styles.linkAction}`}
                onClick={() => startEdit(t)}
                aria-label={`Edit ${t.lookName}`}
              >
                edit
              </button>
              {t.origin === 'area' && (
                <button
                  type="button"
                  className={`${styles.linkButton} ${styles.linkAction}`}
                  onClick={() => onHide(rid)}
                  aria-label={`Hide ${t.lookName}`}
                >
                  hide
                </button>
              )}
              {t.origin === 'area' && t.overridden && (
                <button
                  type="button"
                  className={`${styles.linkButton} ${styles.linkAction}`}
                  onClick={() => onReset(rid)}
                  aria-label={`Reset ${t.lookName} to default`}
                >
                  reset to default
                </button>
              )}
              {t.origin === 'custom' && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => onRemoveCustom(rid)}
                  aria-label={`Remove ${t.lookName}`}
                >
                  remove
                </button>
              )}
            </span>
          </div>
        )}
        {!editing && t.origin === 'area' && t.overridden && (
          <div className={styles.targetDefault}>
            Shared list: {t.defaultLookName} · <code>{t.defaultEngageName}</code>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className={styles.stepPanel}>
      <div className={styles.subHead}>
        <span>
          <strong>{areaName}</strong> — {enabledCount} of {shown.length} selected
        </span>
        <HelpInfoButton topic="Targets" open={false} onToggle={() => setShowHelp(true)} />
      </div>

      {loading && <div className={styles.notice}>Loading targets…</div>}

      {!loading && areaTargets.length === 0 && customTargets.length === 0 && hidden.length === 0 && (
        <div className={styles.notice}>
          This area has no recommended targets on record — add the ones you kill below (the name you see when you
          walk into the room, and the keyword for <code>kill</code>).
        </div>
      )}

      {areaTargets.length > 0 && <ul className={styles.targetList}>{areaTargets.map(renderRow)}</ul>}

      {customTargets.length > 0 && (
        <>
          <div className={styles.subHead}>
            <span>Your targets</span>
          </div>
          <ul className={styles.targetList}>{customTargets.map(renderRow)}</ul>
        </>
      )}

      {hidden.length > 0 && (
        <>
          <div className={styles.subHead}>
            <span>Hidden by you ({hidden.length})</span>
          </div>
          <ul className={styles.targetList}>
            {hidden.map((t) => {
              const rid = targetRowId(t);
              return (
                <li key={rid} className={styles.targetItem}>
                  <div className={styles.targetRow}>
                    <span className={styles.targetLook}>{t.lookName}</span>
                    <span className={styles.targetMeta}>
                      <code>{t.engageName}</code>
                      <button
                        type="button"
                        className={`${styles.linkButton} ${styles.linkAction}`}
                        onClick={() => onRestore(rid)}
                        aria-label={`Restore ${t.lookName}`}
                      >
                        restore
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {unmatched.length > 0 && (
        <>
          <div className={styles.subHead}>
            <span>Edits that no longer match this area ({unmatched.length})</span>
          </div>
          <div className={styles.notice}>
            The shared list no longer has these targets, so your edits are not used. They are kept in case the target
            comes back; delete the ones you do not need.
          </div>
          <ul className={styles.targetList}>
            {unmatched.map((u) => (
              <li key={u.id} className={styles.targetItem}>
                <div className={styles.targetRow}>
                  <span className={styles.targetLook}>{u.lookName ?? u.key}</span>
                  <span className={styles.targetMeta}>
                    {u.engageName && <code>{u.engageName}</code>}
                    {u.hidden && <span className={styles.editedBadge}>hidden</span>}
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => onDeleteUnmatched(u.id)}
                      aria-label={`Delete edit for ${u.key}`}
                    >
                      delete
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className={styles.addTargetRow}>
        <input
          className={styles.input}
          type="text"
          placeholder="Look description — e.g. A centaur ranger eyes you warily."
          value={look}
          onChange={(e) => setLook(e.target.value)}
        />
        <input
          className={styles.inputNarrow}
          type="text"
          placeholder="kill keyword — e.g. ranger"
          value={engage}
          onChange={(e) => setEngage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitCustom()}
        />
        <button type="button" className={styles.button} onClick={submitCustom} disabled={!look.trim() || !engage.trim()}>
          Add
        </button>
      </div>
      {addError && (
        <div className={styles.fieldError} role="alert">
          {addError}
        </div>
      )}
    </div>
  );
};
