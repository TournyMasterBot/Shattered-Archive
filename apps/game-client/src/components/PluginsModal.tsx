import React from 'react';
import styles from '../styles/PluginsModal.module.scss';

import { CORE_PLUGINS, findCorePlugin } from '../features/plugins/registry';
import { usePlugins } from '../hooks/usePlugins';
import { usePluginCssOverrides } from '../hooks/usePluginCssOverrides';
import UserStyleOverrideModal from './UserStyleOverrideModal';
import { pluginHost } from '../features/plugins/pluginHost';
import PluginConfigModal from './PluginConfigModal';

interface PluginsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
}

export const PluginsModal: React.FC<PluginsModalProps> = ({ isOpen, onClose, connectionId }) => {
  const { installed, isInstalled, installCorePlugin, removePlugin, setPluginEnabled, getInstallRecord } =
    usePlugins(connectionId);

  const [activeCssPluginId, setActiveCssPluginId] = React.useState<string | null>(null);
  const [activeConfigPluginId, setActiveConfigPluginId] = React.useState<string | null>(null);

  const cssState = usePluginCssOverrides(connectionId, activeCssPluginId ?? '');

  if (!isOpen) return null;

  const handleExport = (id: string) => {
    const def = findCorePlugin(id);
    if (!def) return;

    const mod = def.create();
    if (!mod.exportPlugin) return;

    const payload = mod.exportPlugin();
    console.log('[Plugin Export]', payload);
  };

  const openCssFor = (pluginId: string) => {
    setActiveCssPluginId(pluginId);
    cssState.open();
  };

  const closeCss = () => {
    // If user previewed changes, revert back to applied CSS on close
    cssState.discardDraft();
    cssState.close();
    setActiveCssPluginId(null);
  };

  const openConfigFor = (pluginId: string) => {
    setActiveConfigPluginId(pluginId);
  };

  const closeConfig = () => {
    setActiveConfigPluginId(null);
  };

  const handleToggleEnabled = (pluginId: string, enabled: boolean) => {
    setPluginEnabled(pluginId, enabled);

    const rec = getInstallRecord(pluginId);
    const userConfig = rec?.userConfig ?? {};

    // Keep runtime pluginHost in sync
    if (enabled) {
      pluginHost.enable(pluginId, userConfig);
    } else {
      pluginHost.disable(pluginId);
    }
  };

  return (
    <>
      <div className={styles.backdrop}>
        <div className={styles.modal}>
          <div className={styles.header}>
            <div className={styles.title}>Plugins</div>
            <button type="button" className={styles.closeButton} onClick={onClose}>
              ✕
            </button>
          </div>

          <div className={styles.body}>
            <div className={styles.sectionTitle}>Core Plugins</div>

            {CORE_PLUGINS.map((p) => {
              const installedNow = isInstalled(p.id);
              const record = getInstallRecord(p.id);

              return (
                <div key={p.id} className={styles.row}>
                  <div className={styles.left}>
                    <div className={styles.name}>{p.manifest.name}</div>
                    <div className={styles.meta}>
                      v{p.manifest.version}
                      {p.manifest.description ? ` • ${p.manifest.description}` : ''}
                    </div>
                  </div>

                  <div className={styles.right}>
                    {!installedNow ? (
                      <button type="button" className={styles.primaryButton} onClick={() => installCorePlugin(p.id)}>
                        Install
                      </button>
                    ) : (
                      <>
                        <label className={styles.toggle}>
                          <input
                            type="checkbox"
                            checked={!!record?.enabled}
                            onChange={(e) => handleToggleEnabled(p.id, e.target.checked)}
                          />
                          <span>{record?.enabled ? 'On' : 'Off'}</span>
                        </label>

                        <button type="button" className={styles.secondaryButton} onClick={() => openConfigFor(p.id)}>
                          Configure…
                        </button>

                        <button type="button" className={styles.secondaryButton} onClick={() => openCssFor(p.id)}>
                          Plugin CSS…
                        </button>

                        {p.manifest.supportsExport && (
                          <button type="button" className={styles.secondaryButton} onClick={() => handleExport(p.id)}>
                            Export
                          </button>
                        )}

                        <button type="button" className={styles.dangerButton} onClick={() => removePlugin(p.id)}>
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            <div className={styles.sectionTitle}>Installed</div>
            <div className={styles.installedHint}>
              {installed.length === 0
                ? 'No plugins installed.'
                : `${installed.length} installed plugin(s) for this connection.`}
            </div>
          </div>
        </div>
      </div>

      {activeCssPluginId && (
        <UserStyleOverrideModal
          isOpen={cssState.isOpen}
          appliedCss={cssState.appliedCss}
          draftCss={cssState.draftCss}
          onChangeDraft={cssState.setDraftCss}
          onPreview={() => {
            cssState.save();
            closeCss();
          }}
          onSave={() => {
            cssState.save();
            closeCss();
          }}
          onDiscardDraft={() => {
            cssState.discardDraft();
            closeCss();
          }}
          onClose={closeCss}
        />
      )}

      {activeConfigPluginId && (
        <PluginConfigModal
          isOpen={true}
          onClose={closeConfig}
          connectionId={connectionId}
          pluginId={activeConfigPluginId}
        />
      )}
    </>
  );
};

export default PluginsModal;
