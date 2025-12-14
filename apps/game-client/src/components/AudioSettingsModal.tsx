import React, { useEffect, useMemo, useState } from 'react';
import styles from '../styles/AudioSettingsModal.module.scss';
import {
  getAudioSettings,
  setAudioSettings,
  type AudioSettings,
  type BeepSound,
  type InclusionRule,
} from '../features/audio/audio-settings-store';
import { playBeepSound } from '../features/audio/audio-beep';
import { saveAudioAsset, deleteAudioAsset } from '../features/audio/audio-asset-store';

type TabId = 'general' | 'inclusions' | 'exclusions' | 'sounds';

export interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function trimLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function newRule(): InclusionRule {
  return {
    id: `rule_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    enabled: true,
    pattern: '',
  };
}

function ensureOsc(sound: BeepSound): Extract<BeepSound, { kind: 'osc' }> {
  if (sound.kind === 'osc') return sound;
  return { kind: 'osc', frequencyHz: 880, durationMs: 60, volume: 0.18, type: 'sine' };
}

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({ isOpen, onClose }) => {
  const [active, setActive] = useState<TabId>('general');
  const [draft, setDraft] = useState<AudioSettings>(() => getAudioSettings());

  useEffect(() => {
    if (!isOpen) return;
    setDraft(getAudioSettings());
    setActive('general');
  }, [isOpen]);

  const excludeText = useMemo(() => (draft.excludePatterns ?? []).join('\n'), [draft.excludePatterns]);

  if (!isOpen) return null;

  const save = () => {
    // prune empty rules
    const includeRules = (draft.includeRules ?? [])
      .map((r) => ({ ...r, pattern: (r.pattern ?? '').trim() }))
      .filter((r) => r.pattern.length > 0);

    setAudioSettings({ ...draft, includeRules });
    onClose();
  };

  const testSound = async (sound: BeepSound) => {
    // even if beeps disabled, allow testing inside settings
    await playBeepSound(sound);
  };

  const setDefaultBeep = (next: BeepSound) => setDraft({ ...draft, defaultBeep: next });

  const updateRule = (id: string, patch: Partial<InclusionRule>) => {
    setDraft({
      ...draft,
      includeRules: (draft.includeRules ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  const removeRule = async (id: string) => {
    // If the rule had an asset sound, you MAY want to delete it.
    // We only delete if it’s asset-based (safe + avoids orphan blobs).
    const rule = (draft.includeRules ?? []).find((r) => r.id === id);
    const sound = rule?.sound;
    if (sound?.kind === 'asset') {
      try {
        await deleteAudioAsset(sound.assetId);
      } catch {
        // ignore
      }
    }

    setDraft({ ...draft, includeRules: (draft.includeRules ?? []).filter((r) => r.id !== id) });
  };

  const defaultOsc = ensureOsc(draft.defaultBeep);

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.title}>Audio Settings</div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.leftNav}>
            <button
              type="button"
              className={`${styles.navItem} ${active === 'general' ? styles.navItemActive : ''}`}
              onClick={() => setActive('general')}
            >
              General
            </button>

            <button
              type="button"
              className={`${styles.navItem} ${active === 'inclusions' ? styles.navItemActive : ''}`}
              onClick={() => setActive('inclusions')}
            >
              Inclusions
            </button>

            <button
              type="button"
              className={`${styles.navItem} ${active === 'exclusions' ? styles.navItemActive : ''}`}
              onClick={() => setActive('exclusions')}
            >
              Exclusions
            </button>

            <button
              type="button"
              className={`${styles.navItem} ${active === 'sounds' ? styles.navItemActive : ''}`}
              onClick={() => setActive('sounds')}
            >
              Sounds
            </button>
          </div>

          <div className={styles.rightPane}>
            {active === 'general' && (
              <div className={styles.section}>
                <label className={styles.row}>
                  <input
                    type="checkbox"
                    checked={draft.beepsEnabled}
                    onChange={(e) => setDraft({ ...draft, beepsEnabled: e.target.checked })}
                  />
                  <span>Enable audio beeps</span>
                </label>

                <label className={styles.row}>
                  <input
                    type="checkbox"
                    checked={draft.beepOnBellChar}
                    onChange={(e) => setDraft({ ...draft, beepOnBellChar: e.target.checked })}
                    disabled={!draft.beepsEnabled}
                  />
                  <span>Beep when the server sends BEL (\u0007)</span>
                </label>

                <div className={styles.hint}>
                  Browsers may require a user interaction before audio plays (click/tap anywhere).
                </div>

                <div className={styles.inlineActions}>
                  <button type="button" className={styles.testButton} onClick={() => testSound(draft.defaultBeep)}>
                    Test default beep
                  </button>
                </div>
              </div>
            )}

            {active === 'exclusions' && (
              <div className={styles.section}>
                <div className={styles.field}>
                  <div className={styles.label}>Exclusion lines (suppress beeps)</div>
                  <textarea
                    className={styles.textarea}
                    value={excludeText}
                    onChange={(e) => setDraft({ ...draft, excludePatterns: trimLines(e.target.value) })}
                    placeholder="One substring per line. If the raw line contains it, no beep."
                    spellCheck={false}
                  />
                </div>

                <div className={styles.hint}>Exclusions win over inclusions and BEL beeps.</div>
              </div>
            )}

            {active === 'sounds' && (
              <div className={styles.section}>
                <div className={styles.field}>
                  <div className={styles.label}>Default beep</div>

                  <div className={styles.soundCard}>
                    <div className={styles.soundRow}>
                      <button type="button" className={styles.testButton} onClick={() => testSound(draft.defaultBeep)}>
                        Test
                      </button>

                      <div className={styles.soundKind}>
                        <span className={styles.muted}>Type:</span>{' '}
                        <strong>
                          {draft.defaultBeep.kind === 'osc'
                            ? 'Oscillator'
                            : draft.defaultBeep.kind === 'asset'
                              ? 'Local file'
                              : 'URL'}
                        </strong>
                      </div>
                    </div>

                    <div className={styles.soundChoiceRow}>
                      <button
                        type="button"
                        className={styles.smallButton}
                        onClick={() =>
                          setDefaultBeep({
                            kind: 'osc',
                            frequencyHz: defaultOsc.frequencyHz,
                            durationMs: defaultOsc.durationMs,
                            volume: defaultOsc.volume,
                            type: defaultOsc.type ?? 'sine',
                          })
                        }
                      >
                        Use oscillator
                      </button>

                      <label className={styles.filePicker}>
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={async (e) => {
                            const file = e.currentTarget.files?.[0];
                            e.currentTarget.value = '';
                            if (!file) return;

                            const { assetId } = await saveAudioAsset(file);
                            setDefaultBeep({ kind: 'asset', assetId, volume: 0.35 });
                          }}
                        />
                        Choose local audio…
                      </label>
                    </div>

                    {draft.defaultBeep.kind === 'osc' && (
                      <div className={styles.grid3}>
                        <label className={styles.smallField}>
                          Frequency (Hz)
                          <input
                            type="number"
                            min={50}
                            max={6000}
                            value={defaultOsc.frequencyHz}
                            onChange={(e) =>
                              setDefaultBeep({ ...defaultOsc, kind: 'osc', frequencyHz: Number(e.target.value) })
                            }
                          />
                        </label>

                        <label className={styles.smallField}>
                          Duration (ms)
                          <input
                            type="number"
                            min={10}
                            max={4000}
                            value={defaultOsc.durationMs}
                            onChange={(e) =>
                              setDefaultBeep({ ...defaultOsc, kind: 'osc', durationMs: Number(e.target.value) })
                            }
                          />
                        </label>

                        <label className={styles.smallField}>
                          Volume (0..1)
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={defaultOsc.volume}
                            onChange={(e) =>
                              setDefaultBeep({ ...defaultOsc, kind: 'osc', volume: Number(e.target.value) })
                            }
                          />
                        </label>
                      </div>
                    )}

                    {(draft.defaultBeep.kind === 'asset' || draft.defaultBeep.kind === 'file') && (
                      <div className={styles.grid1}>
                        <label className={styles.smallField}>
                          Volume (0..1)
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={draft.defaultBeep.volume}
                            onChange={(e) =>
                              setDefaultBeep({ ...draft.defaultBeep, volume: Number(e.target.value) } as any)
                            }
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {active === 'inclusions' && (
              <div className={styles.section}>
                <div className={styles.hint}>
                  Inclusion rules beep when the line contains the substring — even if there is no BEL. Each rule can
                  optionally override the sound.
                </div>

                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className={styles.smallButton}
                    onClick={() => setDraft({ ...draft, includeRules: [...(draft.includeRules ?? []), newRule()] })}
                  >
                    + Add inclusion rule
                  </button>
                </div>

                {(draft.includeRules ?? []).length === 0 && <div className={styles.muted}>No inclusion rules yet.</div>}

                <div className={styles.rulesList}>
                  {(draft.includeRules ?? []).map((r) => {
                    const effectiveSound = r.sound ?? draft.defaultBeep;

                    return (
                      <div key={r.id} className={styles.ruleRow}>
                        <div className={styles.ruleHeader}>
                          <label className={styles.ruleEnabled}>
                            <input
                              type="checkbox"
                              checked={r.enabled}
                              onChange={(e) => updateRule(r.id, { enabled: e.target.checked })}
                            />
                          </label>

                          <input
                            className={styles.rulePattern}
                            value={r.pattern}
                            placeholder="Substring match (case-sensitive)"
                            onChange={(e) => updateRule(r.id, { pattern: e.target.value })}
                            spellCheck={false}
                          />
                        </div>

                        <div className={styles.ruleSoundControls}>
                          <button
                            type="button"
                            className={styles.testButton}
                            onClick={() => testSound(effectiveSound)}
                            title="Test this rule’s current sound"
                          >
                            Test
                          </button>

                          <button
                            type="button"
                            className={styles.smallButton}
                            onClick={() => updateRule(r.id, { sound: undefined })}
                            title="Use default beep"
                          >
                            Default
                          </button>

                          <button
                            type="button"
                            className={styles.smallButton}
                            onClick={() =>
                              updateRule(r.id, {
                                sound: { kind: 'osc', frequencyHz: 660, durationMs: 80, volume: 0.18, type: 'sine' },
                              })
                            }
                            title="Use oscillator override"
                          >
                            Osc
                          </button>

                          <label className={styles.filePickerSmall} title="Choose local audio override">
                            <input
                              type="file"
                              accept="audio/*"
                              onChange={async (e) => {
                                const file = e.currentTarget.files?.[0];
                                e.currentTarget.value = '';
                                if (!file) return;

                                const { assetId } = await saveAudioAsset(file);
                                updateRule(r.id, { sound: { kind: 'asset', assetId, volume: 0.35 } });
                              }}
                            />
                            File…
                          </label>

                          <button type="button" className={styles.smallDanger} onClick={() => void removeRule(r.id)}>
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className={styles.hint}>
                  If a rule is too noisy, prefer adding an exclusion line that matches it.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.saveButton} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default AudioSettingsModal;
