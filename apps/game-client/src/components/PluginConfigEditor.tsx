// apps/game-client/src/components/PluginConfigEditor.tsx
import React, { useMemo, useState } from 'react';
import type { PluginConfigField, PluginConfigSchema, PluginId } from '@shatteredarchive/types-client';
import usePlugins from '../hooks/usePlugins';
import { pluginHost } from '../features/plugins/pluginHost';

type Props = {
  connectionId: string;
  pluginId: PluginId;
  schema: PluginConfigSchema;
};

function toInputString(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v);
}

export const PluginConfigEditor: React.FC<Props> = ({ connectionId, pluginId, schema }) => {
  const { getInstallRecord, updatePluginConfig } = usePlugins(connectionId);

  const record = getInstallRecord(pluginId);
  const defaults = schema.defaults ?? {};

  // Load initial from storage (not from pluginHost)
  const initial = useMemo(() => ({ ...defaults, ...(record?.userConfig ?? {}) }), [pluginId, record, defaults]);

  const [draft, setDraft] = useState<Record<string, unknown>>(initial);

  const setField = (key: string, value: unknown) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      // Persist the full config object
      updatePluginConfig(pluginId, next);
      pluginHost.updateEnabledPluginConfig(pluginId, next);
      return next;
    });
  };

  const renderField = (f: PluginConfigField) => {
    const val = draft[f.key];

    if (f.type === 'number') {
      const s = toInputString(val);

      return (
        <div key={f.key} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>{f.label}</div>
          {f.description ? <div style={{ opacity: 0.8, marginBottom: 4 }}>{f.description}</div> : null}

          <input
            type="number"
            value={s}
            min={f.min}
            max={f.max}
            step={f.step ?? 1}
            onChange={(e) => {
              const raw = e.target.value;
              setField(f.key, raw === '' ? undefined : Number(raw));
            }}
            style={{ width: 220 }}
          />
        </div>
      );
    }

    if (f.type === 'boolean') {
      const b = val === true;

      return (
        <div key={f.key} style={{ marginBottom: 12 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={b} onChange={(e) => setField(f.key, e.target.checked)} />
            <span style={{ fontWeight: 600 }}>{f.label}</span>
          </label>
          {f.description ? <div style={{ opacity: 0.8, marginTop: 4 }}>{f.description}</div> : null}
        </div>
      );
    }

    return null;
  };

  return <div>{schema.fields.map(renderField)}</div>;
};

export default PluginConfigEditor;
