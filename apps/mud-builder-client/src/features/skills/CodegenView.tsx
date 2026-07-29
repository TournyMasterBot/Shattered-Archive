import { useEffect, useMemo, useState } from 'react';
import {
  validateSpellSpec,
  generateSpellC,
  generateOverlayRow,
  emitSkillsFile,
  stockSkillsFile,
  TAR_CHAR_OFFENSIVE,
  TAR_CHAR_DEFENSIVE,
  DAMAGE_TYPE_CODE,
  APPLY_LOCATION_CODE,
  AFF_FLAG_MACRO,
  CURE_CONDITION_GSN,
  type SpellSpec,
  type DamageType,
  type ApplyLocation,
  type AffFlag,
  type CureCondition,
} from '@shatteredarchive/merc-area';

import { ApiError, api } from '../../api/client.js';
import { ConflictPanel, NumField, TextField } from '../areas/workbench.js';
import { Toast, type ToastState } from '../shared/Toast.js';
import '../areas/areas.css';

/**
 * New-spell C codegen assist (Phase 14a). A builder authors a spec declaratively; this
 * NEVER writes, compiles, or deploys anything — it generates a 4-section reviewable C
 * patch (magic.h, magic.c, skills_data.c, const.c) for a human to apply by hand. Specs
 * persist as `<area>/codegen/spells.json` builder metadata; the game never reads them.
 *
 * The skills.dat-shape preview below is informational only, not a live save: skills.dat
 * can only overlay data on a row that ALREADY exists in the compiled skill_table (see
 * spell-codegen.ts's file header) — a brand-new spell's deployable artifact is the const.c
 * row in the patch, not a skills.dat write. Once that patch is compiled in, the spell
 * becomes an ordinary stock row, editable from the Skills sub-view like any other.
 */
const DAMAGE_TYPES = Object.keys(DAMAGE_TYPE_CODE) as DamageType[];
const APPLY_LOCATIONS = Object.keys(APPLY_LOCATION_CODE) as ApplyLocation[];
const AFF_FLAGS = Object.keys(AFF_FLAG_MACRO) as AffFlag[];
const CURE_CONDITIONS = Object.keys(CURE_CONDITION_GSN) as CureCondition[];

const stockNames = new Set(stockSkillsFile().skills.map((s) => s.name));

function defaultDatDefaults(): SpellSpec['datDefaults'] {
  return { levels: [10, 10, 10, 10], ratings: [1, 1, 1, 1], mana: 20, lag: 12, minPosition: 7, damageNoun: '', msgOff: 'The magic fades.' };
}

function archetypeDefaults(archetype: SpellSpec['archetype']): Partial<SpellSpec> {
  switch (archetype) {
    case 'damage':
      return { target: TAR_CHAR_OFFENSIVE, damage: { baseDiceCount: 6, perLevelDiv: 2, diceSize: 8, saveType: 'half', damageType: 'fire' } };
    case 'buff':
      return {
        target: TAR_CHAR_DEFENSIVE,
        buff: {
          location: 'ac',
          modifierFlat: -10,
          durationFlat: 24,
          alreadyAffectedSelfMsg: 'You are already affected.',
          alreadyAffectedOtherMsg: '$N is already affected.',
          castMsg: 'You feel a magical effect take hold.',
        },
      };
    case 'debuff':
      return {
        target: TAR_CHAR_OFFENSIVE,
        debuff: {
          location: 'hitroll',
          modifierFlat: -2,
          durationLevelPlus: 1,
          bitvector: 'weaken',
          castMsgVictim: 'You feel weaker!',
          castMsgRoom: '$n looks weaker.',
        },
      };
    case 'heal':
      return { target: TAR_CHAR_DEFENSIVE, heal: { diceCount: 1, diceSize: 8, levelDiv: 3 } };
    case 'cure':
      return { target: TAR_CHAR_DEFENSIVE, cure: { condition: 'blindness', notAffectedMsg: "You aren't afflicted." } };
    default:
      return {};
  }
}

function newSpec(archetype: SpellSpec['archetype']): SpellSpec {
  return { name: '', funName: 'spell_', archetype, datDefaults: defaultDatDefaults(), ...archetypeDefaults(archetype) } as SpellSpec;
}

export default function CodegenView({ writeEnabled }: { writeEnabled: boolean }) {
  const [specs, setSpecs] = useState<SpellSpec[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [baseHash, setBaseHash] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const load = () => {
    api
      .codegenSpells()
      .then((r) => {
        setSpecs(r.specs);
        setBaseHash(r.baseHash);
        setConflict(false);
        setSelected(null);
      })
      .catch((e) => setToast({ kind: 'err', text: `server unreachable: ${(e as Error).message}` }));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spec = selected !== null ? (specs?.[selected] ?? null) : null;

  const summaries = useMemo(() => {
    if (!specs) return [];
    const existingFunNames = new Set<string>();
    return specs.map((s) => {
      const summary = validateSpellSpec(s, { existingOverlayNames: stockNames, existingFunNames });
      existingFunNames.add(s.funName);
      return summary;
    });
  }, [specs]);

  const anyErrors = summaries.some((s) => s.errors.length > 0);
  const selectedSummary = selected !== null ? summaries[selected] : undefined;

  const generated = useMemo(() => {
    if (!spec || !selectedSummary || selectedSummary.errors.length > 0) return null;
    try {
      return generateSpellC(spec);
    } catch {
      return null;
    }
  }, [spec, selectedSummary]);

  const overlayPreview = useMemo(() => {
    if (!spec) return null;
    try {
      return emitSkillsFile({ skills: [generateOverlayRow(spec)] });
    } catch {
      return null;
    }
  }, [spec]);

  const update = (next: SpellSpec) => {
    if (!specs || selected === null) return;
    setSpecs(specs.map((s, i) => (i === selected ? next : s)));
  };

  const addSpec = () => {
    const next = [...(specs ?? []), newSpec('damage')];
    setSpecs(next);
    setSelected(next.length - 1);
  };

  const removeSpec = () => {
    if (!specs || selected === null) return;
    setSpecs(specs.filter((_, i) => i !== selected));
    setSelected(null);
  };

  const changeArchetype = (archetype: SpellSpec['archetype']) => {
    if (!spec) return;
    update({ name: spec.name, funName: spec.funName, datDefaults: spec.datDefaults, archetype, ...archetypeDefaults(archetype) } as SpellSpec);
  };

  const save = async () => {
    if (!specs) return;
    try {
      const r = await api.saveCodegenSpells(specs, baseHash);
      setBaseHash(r.hash ?? null);
      setConflict(false);
      setToast({ kind: 'ok', text: 'spec manifest saved' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        return;
      }
      setToast({ kind: 'err', text: `save failed: ${(e as Error).message}` });
    }
  };

  const conflictSaveAnyway = async () => {
    if (!specs) return;
    if (!window.confirm('Overwrite the other save of the spec manifest with yours? Theirs is backed up first.')) return;
    try {
      const r = await api.saveCodegenSpells(specs);
      setBaseHash(r.hash ?? null);
      setConflict(false);
      setToast({ kind: 'ok', text: 'spec manifest saved' });
    } catch (e) {
      setToast({ kind: 'err', text: `save failed: ${(e as Error).message}` });
    }
  };

  const download = () => {
    if (!generated || !spec) return;
    const url = URL.createObjectURL(new Blob([generated.patchText], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${spec.funName}.patch.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <p className="mb-muted">
        Author a brand-new spell declaratively. This does NOT write, compile, or deploy anything — it generates a
        4-section C patch (magic.h, magic.c, skills_data.c, const.c) for a human to review and apply by hand. Specs
        persist here as builder metadata only; the game never reads them.
      </p>

      {!specs && <p className="mb-muted">Loading…</p>}

      {specs && (
        <>
          {conflict && <ConflictPanel file="codegen/spells.json" onReload={load} onSaveAnyway={conflictSaveAnyway} />}
          <div className="mb-entity-actions">
            <button type="button" onClick={save} disabled={!writeEnabled || anyErrors}>
              Save spec manifest
            </button>
            {!writeEnabled && <span className="mb-muted">writes disabled — download only</span>}
          </div>

          <div className="mb-editor-split">
            <nav className="mb-room-list">
              <h4>Specs ({specs.length})</h4>
              <ul>
                {specs.map((s, i) => (
                  <li key={i}>
                    <button type="button" className={i === selected ? 'mb-active' : ''} onClick={() => setSelected(i)}>
                      {s.name || '(unnamed)'} {summaries[i]?.errors.length ? '⚠' : ''}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mb-entity-actions">
                <button type="button" onClick={addSpec}>
                  Add spec
                </button>
                {selected !== null && (
                  <button type="button" className="mb-danger" onClick={removeSpec}>
                    Remove
                  </button>
                )}
              </div>
            </nav>

            <section>
              {!spec && <p className="mb-muted">Select or add a spec to author its C.</p>}
              {spec && selected !== null && (
                <fieldset className="mb-fieldset">
                  <legend>{spec.name || '(unnamed spell)'}</legend>

                  <div className="mb-form-grid">
                    <TextField label="Name" value={spec.name} onChange={(t) => update({ ...spec, name: t })} />
                    <TextField label="Fun name" value={spec.funName} onChange={(t) => update({ ...spec, funName: t })} />
                    <label className="mb-field">
                      <span>Archetype</span>
                      <select
                        aria-label="Archetype"
                        value={spec.archetype}
                        onChange={(e) => changeArchetype(e.target.value as SpellSpec['archetype'])}
                      >
                        <option value="damage">Damage</option>
                        <option value="buff">Buff</option>
                        <option value="debuff">Debuff</option>
                        <option value="heal">Heal</option>
                        <option value="cure">Cure</option>
                      </select>
                    </label>
                  </div>

                  {spec.archetype === 'damage' &&
                    spec.damage &&
                    (() => {
                      const damage = spec.damage;
                      return (
                        <div className="mb-form-grid">
                          <NumField label="Base dice count" value={damage.baseDiceCount} onChange={(n) => update({ ...spec, damage: { ...damage, baseDiceCount: n } })} />
                          <NumField label="Dice size" value={damage.diceSize} onChange={(n) => update({ ...spec, damage: { ...damage, diceSize: n } })} />
                          <NumField
                            label="Per-level divisor"
                            value={damage.perLevelDiv ?? 0}
                            onChange={(n) => update({ ...spec, damage: { ...damage, perLevelDiv: n || undefined } })}
                          />
                          <label className="mb-field">
                            <span>Save type</span>
                            <select
                              aria-label="Save type"
                              value={damage.saveType}
                              onChange={(e) => update({ ...spec, damage: { ...damage, saveType: e.target.value as 'none' | 'half' } })}
                            >
                              <option value="none">none</option>
                              <option value="half">half on save</option>
                            </select>
                          </label>
                          <label className="mb-field">
                            <span>Damage type</span>
                            <select
                              aria-label="Damage type"
                              value={damage.damageType}
                              onChange={(e) => update({ ...spec, damage: { ...damage, damageType: e.target.value as DamageType } })}
                            >
                              {DAMAGE_TYPES.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      );
                    })()}

                  {spec.archetype === 'buff' &&
                    spec.buff &&
                    (() => {
                      const buff = spec.buff;
                      return (
                        <div className="mb-form-grid">
                          <label className="mb-field">
                            <span>Apply location</span>
                            <select aria-label="Apply location" value={buff.location} onChange={(e) => update({ ...spec, buff: { ...buff, location: e.target.value as ApplyLocation } })}>
                              {APPLY_LOCATIONS.map((l) => (
                                <option key={l} value={l}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </label>
                          <NumField
                            label="Modifier (flat)"
                            value={buff.modifierFlat ?? 0}
                            onChange={(n) => update({ ...spec, buff: { ...buff, modifierFlat: n || undefined, modifierPerLevelDiv: undefined } })}
                          />
                          <NumField
                            label="Modifier per-level divisor"
                            value={buff.modifierPerLevelDiv ?? 0}
                            onChange={(n) => update({ ...spec, buff: { ...buff, modifierPerLevelDiv: n || undefined, modifierFlat: undefined } })}
                          />
                          <NumField
                            label="Duration (flat)"
                            value={buff.durationFlat ?? 0}
                            onChange={(n) => update({ ...spec, buff: { ...buff, durationFlat: n || undefined, durationLevelPlus: undefined } })}
                          />
                          <NumField
                            label="Duration + level"
                            value={buff.durationLevelPlus ?? 0}
                            onChange={(n) => update({ ...spec, buff: { ...buff, durationLevelPlus: n || undefined, durationFlat: undefined } })}
                          />
                          <label className="mb-field">
                            <span>Bitvector (AFF_*, optional)</span>
                            <select
                              aria-label="Bitvector"
                              value={buff.bitvector ?? ''}
                              onChange={(e) => update({ ...spec, buff: { ...buff, bitvector: (e.target.value || undefined) as AffFlag | undefined } })}
                            >
                              <option value="">(none)</option>
                              {AFF_FLAGS.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                          </label>
                          <TextField label="Already-affected (self)" value={buff.alreadyAffectedSelfMsg} onChange={(t) => update({ ...spec, buff: { ...buff, alreadyAffectedSelfMsg: t } })} />
                          <TextField label="Already-affected (other)" value={buff.alreadyAffectedOtherMsg} onChange={(t) => update({ ...spec, buff: { ...buff, alreadyAffectedOtherMsg: t } })} />
                          <TextField label="Cast message" value={buff.castMsg} onChange={(t) => update({ ...spec, buff: { ...buff, castMsg: t } })} />
                        </div>
                      );
                    })()}

                  {spec.archetype === 'debuff' &&
                    spec.debuff &&
                    (() => {
                      const debuff = spec.debuff;
                      return (
                        <div className="mb-form-grid">
                          <label className="mb-field">
                            <span>Apply location</span>
                            <select aria-label="Apply location" value={debuff.location} onChange={(e) => update({ ...spec, debuff: { ...debuff, location: e.target.value as ApplyLocation } })}>
                              {APPLY_LOCATIONS.map((l) => (
                                <option key={l} value={l}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </label>
                          <NumField
                            label="Modifier (flat)"
                            value={debuff.modifierFlat ?? 0}
                            onChange={(n) => update({ ...spec, debuff: { ...debuff, modifierFlat: n || undefined, modifierPerLevelDiv: undefined } })}
                          />
                          <NumField
                            label="Modifier per-level divisor"
                            value={debuff.modifierPerLevelDiv ?? 0}
                            onChange={(n) => update({ ...spec, debuff: { ...debuff, modifierPerLevelDiv: n || undefined, modifierFlat: undefined } })}
                          />
                          <NumField
                            label="Duration (flat)"
                            value={debuff.durationFlat ?? 0}
                            onChange={(n) => update({ ...spec, debuff: { ...debuff, durationFlat: n || undefined, durationLevelPlus: undefined } })}
                          />
                          <NumField
                            label="Duration + level"
                            value={debuff.durationLevelPlus ?? 0}
                            onChange={(n) => update({ ...spec, debuff: { ...debuff, durationLevelPlus: n || undefined, durationFlat: undefined } })}
                          />
                          <label className="mb-field">
                            <span>Bitvector (AFF_*, required)</span>
                            <select
                              aria-label="Bitvector"
                              value={debuff.bitvector}
                              onChange={(e) => update({ ...spec, debuff: { ...debuff, bitvector: e.target.value as AffFlag } })}
                            >
                              {AFF_FLAGS.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                          </label>
                          <TextField label="Cast message (victim)" value={debuff.castMsgVictim} onChange={(t) => update({ ...spec, debuff: { ...debuff, castMsgVictim: t } })} />
                          <TextField label="Cast message (room)" value={debuff.castMsgRoom} onChange={(t) => update({ ...spec, debuff: { ...debuff, castMsgRoom: t } })} />
                        </div>
                      );
                    })()}

                  {spec.archetype === 'heal' &&
                    spec.heal &&
                    (() => {
                      const heal = spec.heal;
                      return (
                        <div className="mb-form-grid">
                          <NumField label="Dice count" value={heal.diceCount} onChange={(n) => update({ ...spec, heal: { ...heal, diceCount: n } })} />
                          <NumField label="Dice size" value={heal.diceSize} onChange={(n) => update({ ...spec, heal: { ...heal, diceSize: n } })} />
                          <NumField label="Level divisor" value={heal.levelDiv ?? 0} onChange={(n) => update({ ...spec, heal: { ...heal, levelDiv: n || undefined } })} />
                        </div>
                      );
                    })()}

                  {spec.archetype === 'cure' &&
                    spec.cure &&
                    (() => {
                      const cure = spec.cure;
                      return (
                        <div className="mb-form-grid">
                          <label className="mb-field">
                            <span>Condition</span>
                            <select aria-label="Condition" value={cure.condition} onChange={(e) => update({ ...spec, cure: { ...cure, condition: e.target.value as CureCondition } })}>
                              {CURE_CONDITIONS.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </label>
                          <TextField label="Not-affected message" value={cure.notAffectedMsg} onChange={(t) => update({ ...spec, cure: { ...cure, notAffectedMsg: t } })} />
                        </div>
                      );
                    })()}

                  <div className="mb-form-grid">
                    <NumField label="Mana" value={spec.datDefaults.mana} onChange={(n) => update({ ...spec, datDefaults: { ...spec.datDefaults, mana: n } })} />
                    <NumField label="Lag (beats)" value={spec.datDefaults.lag} onChange={(n) => update({ ...spec, datDefaults: { ...spec.datDefaults, lag: n } })} />
                    <NumField label="Min position" value={spec.datDefaults.minPosition} onChange={(n) => update({ ...spec, datDefaults: { ...spec.datDefaults, minPosition: n } })} />
                    <TextField label="Damage noun" value={spec.datDefaults.damageNoun} onChange={(t) => update({ ...spec, datDefaults: { ...spec.datDefaults, damageNoun: t } })} />
                    <TextField label="Wear-off message" value={spec.datDefaults.msgOff} onChange={(t) => update({ ...spec, datDefaults: { ...spec.datDefaults, msgOff: t } })} />
                  </div>

                  <div className="mb-form-grid">
                    {([0, 1, 2, 3] as const).map((i) => (
                      <NumField
                        key={`lvl-${i}`}
                        label={`Level (class ${i})`}
                        value={spec.datDefaults.levels[i]}
                        onChange={(n) =>
                          update({
                            ...spec,
                            datDefaults: { ...spec.datDefaults, levels: spec.datDefaults.levels.map((v, j) => (j === i ? n : v)) as [number, number, number, number] },
                          })
                        }
                      />
                    ))}
                    {([0, 1, 2, 3] as const).map((i) => (
                      <NumField
                        key={`rat-${i}`}
                        label={`Rating (class ${i})`}
                        value={spec.datDefaults.ratings[i]}
                        onChange={(n) =>
                          update({
                            ...spec,
                            datDefaults: { ...spec.datDefaults, ratings: spec.datDefaults.ratings.map((v, j) => (j === i ? n : v)) as [number, number, number, number] },
                          })
                        }
                      />
                    ))}
                  </div>

                  {selectedSummary?.errors.map((e) => (
                    <p key={e} className="mb-world-error">
                      {e}
                    </p>
                  ))}
                  {selectedSummary?.warnings.map((w) => (
                    <p key={w} className="mb-warning">
                      ⚠ {w}
                    </p>
                  ))}

                  <div className="mb-entity-actions">
                    <button type="button" onClick={download} disabled={!generated}>
                      Download patch
                    </button>
                  </div>

                  {generated && (
                    <fieldset className="mb-fieldset">
                      <legend>Generated C patch (4 sections — review before applying)</legend>
                      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{generated.patchText}</pre>
                    </fieldset>
                  )}

                  {overlayPreview && (
                    <fieldset className="mb-fieldset">
                      <legend>skills.dat shape once deployed (informational — nothing is saved to skills.dat here)</legend>
                      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{overlayPreview}</pre>
                    </fieldset>
                  )}
                </fieldset>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
