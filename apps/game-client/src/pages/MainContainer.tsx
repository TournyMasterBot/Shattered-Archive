// apps\game-client\src\pages\MainContainer.tsx
import React from 'react';
import styles from '../styles/MainContainer.module.scss';
import { useVisualViewportHeight } from '../hooks/useVisualViewportHeight';

import { BottomPane } from '../components/BottomPane';
import { UserStyleOverrideModal } from '../components/UserStyleOverrideModal';
import UserScriptSandboxModal from '../components/UserScriptSandboxModal';
import ConnectModal from '../components/ConnectModal';
import PluginsModal from '../components/PluginsModal';

import { useLayoutSizing, useUserCssOverrides, useMainContainer } from '../hooks/useMainContainer';
import { usePlugins } from '../hooks/usePlugins';

import { MainMenuBar } from '../components/MainMenuBar';
import { LayoutShell } from '../components/LayoutShell';
import { useGameConnection } from '../hooks/useGameConnection';

import { CORE_PLUGINS } from '../features/plugins/registry';
import { pluginHost } from '../features/plugins/pluginHost';

import { applyCssToDom, getAppliedCss } from '../features/userStyles/userStyleOverrideStore';
import LibraryModal from '../components/LibraryModal';

import EquipmentModal from '../components/EquipmentModal';
import { useEquipmentCapture } from '../hooks/useEquipmentCapture';
import { useEquipmentDeltas } from '../hooks/useEquipmentDeltas';

import AutoLevelingModal from '../components/AutoLevelingModal';
import { useAutoLeveling } from '../hooks/useAutoLeveling';
import { RuntimeSingleton } from '../features/userScripts/runtimeSingleton';
import { useTerminal } from '../hooks/useTerminal';
import { ShatteredArchiveTerminal } from '../features/terminal/shatteredArchiveTerminal';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';
import FocusBarVitals from '../components/FocusBarVitals';
import ContributeIdentifyModal from '../components/ContributeIdentifyModal';
import ContributeLoreModal from '../components/ContributeLoreModal';

export const MainContainer: React.FC = () => {
  useVisualViewportHeight();
  const main = useMainContainer();
  const gameConn = useGameConnection();

  const userScriptRuntime = RuntimeSingleton.Instance.GetUserScriptRuntime;
  const terminal = ShatteredArchiveTerminal.Instance;

  React.useEffect(() => {
    applyCssToDom(getAppliedCss());
  }, []);

  const { layoutVars, handleVerticalResizeMouseDown, handleHorizontalResizeMouseDown } = useLayoutSizing();

  const {
    userCssApplied,
    userCssDraft,
    setUserCssDraft,
    isStyleModalOpen,
    openStyleModal,
    closeStyleModal,
    saveUserCss,
    discardDraft,
  } = useUserCssOverrides();

  const [isScriptModalOpen, setIsScriptModalOpen] = React.useState(false);
  const [isPluginsModalOpen, setIsPluginsModalOpen] = React.useState(false);
  const [isAutoLevelingModalOpen, setIsAutoLevelingModalOpen] = React.useState(false);

  // Contribute modals
  const [isIdentifyModalOpen, setIsIdentifyModalOpen] = React.useState(false);
  const [isLoreModalOpen, setIsLoreModalOpen] = React.useState(false);

  const handleOpenCustomStyles = () => openStyleModal();
  const handleOpenScriptSandbox = () => setIsScriptModalOpen(true);
  const handleOpenConnect = () => main.openConnectModal();
  const handleOpenPlugins = () => setIsPluginsModalOpen(true);
  const handleOpenLibrary = () => main.openLibraryModal();
  const handleOpenEquipment = () => main.openEquipmentModal();
  const handleOpenAutoLeveling = () => setIsAutoLevelingModalOpen(true);
  const handleOpenIdentifyObject = () => setIsIdentifyModalOpen(true);
  const handleOpenCreatureLore = () => setIsLoreModalOpen(true);

  const connectionId = React.useMemo(() => {
    const host = gameConn.currentHost;
    const port = gameConn.currentPort;

    if (!host || !port) return 'default';
    if (host.includes('dsl-mud')) return 'dsl-mud';
    return `${host}:${port}`;
  }, [gameConn.currentHost, gameConn.currentPort]);

  React.useEffect(() => {
    if (!connectionId) {
      return;
    }
    DispatchEvent('shatteredarchive:connection-changed', {
      connectionId,
      host: gameConn.currentHost,
      port: gameConn.currentPort,
    });
  }, [connectionId, gameConn.currentHost, gameConn.currentPort]);

  const plugins = usePlugins(connectionId);
  useEquipmentCapture(connectionId);
  useEquipmentDeltas(connectionId);

  const auto = useAutoLeveling(connectionId);

  React.useEffect(() => {
    pluginHost.setConnection(connectionId);

    for (const p of CORE_PLUGINS) {
      pluginHost.registerModule(p.create());
    }

    for (const rec of plugins.installed) {
      if (rec.enabled) {
        pluginHost.enable(rec.id, rec.userConfig);
      } else {
        pluginHost.disable(rec.id);
      }
    }

    return () => {
      pluginHost.shutdown();
    };
  }, [connectionId, plugins.installed]);

  return (
    <div className={styles.root}>
      <MainMenuBar
        onOpenCustomStyles={handleOpenCustomStyles}
        onOpenScriptSandbox={handleOpenScriptSandbox}
        onOpenConnect={handleOpenConnect}
        onOpenPlugins={handleOpenPlugins}
        onOpenLibrary={handleOpenLibrary}
        onOpenEquipment={handleOpenEquipment}
        onOpenAutoLeveling={handleOpenAutoLeveling}
        onOpenIdentifyObject={handleOpenIdentifyObject}
        onOpenCreatureLore={handleOpenCreatureLore}
      />

      <FocusBarVitals />

      <LayoutShell
        layoutVars={layoutVars}
        onVerticalResizeMouseDown={handleVerticalResizeMouseDown}
        onHorizontalResizeMouseDown={handleHorizontalResizeMouseDown}
        BottomPaneComponent={BottomPane}
        isConnected={gameConn.isConnected}
        sendRaw={gameConn.sendRaw}
        autoLevelingActive={auto.config.enabled}
        autoLevelRunState={auto.runState}
      />

      <UserStyleOverrideModal
        isOpen={isStyleModalOpen}
        appliedCss={userCssApplied}
        draftCss={userCssDraft}
        onChangeDraft={setUserCssDraft}
        onPreview={(css) => {
          saveUserCss(css);
          closeStyleModal();
        }}
        onSave={(css) => {
          saveUserCss(css);
          closeStyleModal();
        }}
        onDiscardDraft={() => {
          discardDraft();
          closeStyleModal();
        }}
        onClose={closeStyleModal}
      />

      <UserScriptSandboxModal
        isOpen={isScriptModalOpen}
        onClose={() => setIsScriptModalOpen(false)}
        connectionId={connectionId}
      />

      <PluginsModal
        isOpen={isPluginsModalOpen}
        onClose={() => setIsPluginsModalOpen(false)}
        connectionId={connectionId}
      />

      <ConnectModal
        isOpen={main.isConnectModalOpen}
        onClose={main.closeConnectModal}
        isConnected={gameConn.isConnected}
        currentHost={gameConn.currentHost}
        currentPort={gameConn.currentPort}
        onConnect={gameConn.connect}
        onDisconnect={gameConn.disconnect}
      />

      <LibraryModal isOpen={main.isLibraryModalOpen} onClose={main.closeLibraryModal} connectionId={connectionId} />

      <EquipmentModal
        isOpen={main.isEquipmentModalOpen}
        onClose={main.closeEquipmentModal}
        connectionId={connectionId}
      />

      <AutoLevelingModal
        isOpen={isAutoLevelingModalOpen}
        onClose={() => setIsAutoLevelingModalOpen(false)}
        connectionId={connectionId}
        isConnected={gameConn.isConnected}
      />

      {/* ✅ CHANGED: pass connectionId to both contribute modals */}
      <ContributeIdentifyModal
        isOpen={isIdentifyModalOpen}
        onClose={() => setIsIdentifyModalOpen(false)}
        connectionId={connectionId}
      />
      <ContributeLoreModal
        isOpen={isLoreModalOpen}
        onClose={() => setIsLoreModalOpen(false)}
        connectionId={connectionId}
      />
    </div>
  );
};

export default MainContainer;
