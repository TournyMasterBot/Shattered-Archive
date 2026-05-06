// apps/game-client/src/components/PluginsPage.tsx
import React, { useMemo, useState } from 'react';
import type { PluginId } from '@shatteredarchive/types-client';
import styles from '../styles/PluginsModal.module.scss';

import usePlugins from '../hooks/usePlugins';
import PluginConfigModal from './PluginConfigModal';
import { findCorePlugin } from '../features/plugins/registry';
import { pluginHost } from '../features/plugins/pluginHost';

export const PluginsPage: React.FC<{ connectionId: string }> = ({ connectionId }) => {
  const { plugins, enablePlugin, disablePlugin, updatePluginConfig } = usePlugins(connectionId);

  const [configOpen, setConfigOpen] = useState(false);
  const [configPluginId, setConfigPluginId] = useState<PluginId | null>(null);

  // show core plugins first, then imported ones
  const core = useMemo(() => plugins.filter((p) => p.kind === 'core'), [plugins]);
  const imported = useMemo(() => plugins.filter((p) => p.kind === 'imported'), [plugins]);

  const openConfigFor = (id: PluginId) => {
    setConfigPluginId(id);
    setConfigOpen(true);
  };

  const closeConfig = () => {
    setConfigOpen(false);
    setConfigPluginId(null);
  };

  const toggle = (id: PluginId, enabled: boolean) => {
    if (enabled) {
      disablePlugin(id);
      pluginHost.disable(id);
    } else {
      enablePlugin(id);
      // enablePlugin() persists, but does not automatically start runtime.
      // We do runtime enable here with stored userConfig later in PluginsModal.
    }
  };

  const renderRow = (p: any) => {
    const record = p;
    const def = findCorePlugin(record.pluginId);
    const mod = def?.create();

    return (
      <div key={record.pluginId} className={styles.row}>
        <div className={styles.rowMain}>
          <div className={styles.name}>
            {mod?.manifest?.name ?? record.pluginId}
            {mod?.manifest?.tags?.includes('wip') && (
              <span className={styles.wipBadge}>⚙ WIP</span>
            )}
          </div>
          <div className={styles.desc}>{mod?.manifest?.description ?? ''}</div>
        </div>

        <div className={styles.rowActions}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={!!record.enabled}
              onChange={() => toggle(record.pluginId, !!record.enabled)}
            />
            <span>{record.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>

          <button className={styles.button} onClick={() => openConfigFor(record.pluginId)}>
            Configure
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.modalRoot}>
      <div className={styles.title}>Plugins</div>

      <div className={styles.sectionTitle}>Core</div>
      <div className={styles.list}>{core.map(renderRow)}</div>

      <div className={styles.sectionTitle}>Imported</div>
      <div className={styles.list}>{imported.map(renderRow)}</div>

      {configPluginId ? (
        <PluginConfigModal
          isOpen={configOpen}
          onClose={closeConfig}
          connectionId={connectionId}
          pluginId={configPluginId}
          initialUserConfig={plugins.find((p) => p.id === configPluginId)?.userConfig ?? {}}
          isEnabled={plugins.find((p) => p.id === configPluginId)?.enabled}
          onSave={(id, config) => {
            updatePluginConfig(id, config);
            pluginHost.updateEnabledPluginConfig(id, config);
          }}
        />
      ) : null}
    </div>
  );
};

export default PluginsPage;
