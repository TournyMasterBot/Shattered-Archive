import React from 'react';
import { createPortal } from 'react-dom';
import styles from '../styles/PluginConfigModal.module.scss';

import type { PluginId } from '@shatteredarchive/types-client';
import usePlugins from '../hooks/usePlugins';
import { findCorePlugin } from '../features/plugins/registry';
import { pluginHost } from '../features/plugins/pluginHost';

interface PluginConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  pluginId: PluginId;
}

function toNumberOrUndefined(raw: string): number | undefined {
  const s = raw ?? '';
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export const PluginConfigModal: React.FC<PluginConfigModalProps> = ({ isOpen, onClose, connectionId, pluginId }) => {
  const { getInstallRecord, updatePluginConfig, installCorePlugin } = usePlugins(connectionId);

  // ✅ hooks must be unconditional / always in the same order
  const firstInputRef = React.useRef<HTMLInputElement | null>(null);
  const shouldCloseRef = React.useRef(false);

  const record = getInstallRecord(pluginId);

  // Only build plugin + schema when open (avoids unnecessary create() calls)
  const { mod, schema } = React.useMemo(() => {
    if (!isOpen) return { mod: undefined as any, schema: undefined as any };
    const def = findCorePlugin(pluginId);
    const created = def?.create();
    return { mod: created, schema: created?.configSchema };
  }, [isOpen, pluginId]);

  // Ensure install record exists so config persists
  React.useEffect(() => {
    if (!isOpen) return;
    if (record) return;
    installCorePlugin(pluginId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pluginId]);

  const defaults = schema?.defaults ?? {};

  // ✅ include defaults in deps (it changes when schema changes)
  const initialCfg = React.useMemo(() => ({ ...defaults, ...(record?.userConfig ?? {}) }), [defaults, record]);

  const [draft, setDraft] = React.useState<Record<string, unknown>>(() => initialCfg);

  React.useEffect(() => {
    if (!isOpen) return;

    setDraft(initialCfg);
    const t = window.setTimeout(() => firstInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isOpen, initialCfg]);

  const updateDraft = (key: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const save = () => {
    const cleaned = Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== undefined)) as Record<
      string,
      unknown
    >;

    console.debug('[PluginConfigModal] Saving userConfig for', pluginId, cleaned);
    updatePluginConfig(pluginId, cleaned);
    pluginHost.updateEnabledPluginConfig(pluginId, cleaned);
    onClose();
  };

  // Backdrop close guard:
  // Only close if pointer DOWN started on backdrop itself.
  const onBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    shouldCloseRef.current = e.target === e.currentTarget;
  };

  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!shouldCloseRef.current) return;
    if (e.target !== e.currentTarget) return;
    onClose();
  };

  const stopKeysCapture = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const onBackdropKeyDownCapture = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') onClose();
  };

  // ✅ return after all hooks are declared
  if (!isOpen) return null;

  const modal = (
    <div
      className={styles.backdrop}
      onPointerDown={onBackdropPointerDown}
      onClick={onBackdropClick}
      onKeyDownCapture={onBackdropKeyDownCapture}
      onKeyUpCapture={stopKeysCapture}
      onKeyPressCapture={stopKeysCapture}
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDownCapture={stopKeysCapture}
        onKeyUpCapture={stopKeysCapture}
        onKeyPressCapture={stopKeysCapture}
      >
        <div className={styles.header}>
          <div className={styles.title}>Configure: {mod?.manifest?.name ?? pluginId}</div>
          <button className={styles.closeButton} onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {!schema || schema.fields.length === 0 ? (
            <div className={styles.empty}>This plugin has no configuration.</div>
          ) : (
            schema.fields.map((f: any, idx: any) => {
              const value = draft[f.key];

              if (f.type === 'number') {
                return (
                  <div key={f.key} className={styles.field}>
                    <div className={styles.labelRow}>
                      <div className={styles.label}>{f.label}</div>
                      {f.optional ? <div className={styles.optional}>optional</div> : null}
                    </div>

                    {f.description ? <div className={styles.desc}>{f.description}</div> : null}

                    <input
                      ref={idx === 0 ? firstInputRef : undefined}
                      className={styles.input}
                      type="number"
                      value={value === undefined || value === null ? '' : String(value)}
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      onChange={(e) => updateDraft(f.key, toNumberOrUndefined(e.target.value))}
                      onKeyDown={(e) => e.stopPropagation()}
                      onKeyUp={(e) => e.stopPropagation()}
                    />
                  </div>
                );
              }

              if (f.type === 'boolean') {
                return (
                  <label key={f.key} className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={value === true}
                      onChange={(e) => updateDraft(f.key, e.target.checked)}
                      onKeyDown={(e) => e.stopPropagation()}
                      onKeyUp={(e) => e.stopPropagation()}
                    />
                    <span>{f.label}</span>
                  </label>
                );
              }

              return null;
            })
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerSpacer} />
          <button className={styles.secondaryButton} type="button" onClick={onClose}>
            Cancel
          </button>
          <button className={styles.primaryButton} type="button" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default PluginConfigModal;
