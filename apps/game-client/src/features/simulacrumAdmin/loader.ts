import { createActivityLog, type ActivityLog } from './activityLog';
import { createCharacterInfo, type CharacterInfoStore } from './characterInfo';
import { createGmcpCapture, type GmcpCapture } from './gmcpCapture';
import { SIMULACRUM_ADMIN_BUNDLE_MARKER } from './marker';
import { createReplyCollector } from './replyCollector';
import { createConnectionRuntime, type ConnectionRuntime } from './runtime';
import { createSender, type Sender } from './sender';

/** Everything Simulacrum Admin has at run time. */
export interface SimulacrumAdminRuntime {
  /** The string `check:local-only` looks for: present in a flagged bundle, absent from a production one. */
  marker: string;
  /** Whether the client is on the simulacrum right now (follows the socket events). */
  connection: ConnectionRuntime;
  /** The GMCP received from the simulacrum, capped and in memory only. */
  gmcp: GmcpCapture;
  /** The level (and clan flag) from `login_data`; never the name. */
  character: CharacterInfoStore;
  /** What was sent and what the game answered, capped, memory only. */
  activity: ActivityLog;
  /** The only way the feature sends a command. */
  sender: Sender;
  dispose(): void;
}

let shared: SimulacrumAdminRuntime | undefined;

/**
 * The one runtime of this page: `startSimulacrumAdmin` (at page load) and the window share it, so there is a single set of listeners
 * and one view of the connection. Built on first use. Reached only through `index.ts` behind `__SIMULACRUM_ADMIN_LOCAL__`, so a
 * production bundle contains none of this.
 */
export function getSimulacrumAdminRuntime(): SimulacrumAdminRuntime {
  shared ??= loadSimulacrumAdmin();
  return shared;
}

export function loadSimulacrumAdmin(win: Window = window): SimulacrumAdminRuntime {
  let storage: Storage | undefined;
  try {
    storage = win.localStorage;
  } catch {
    storage = undefined; // storage blocked: only the default hosts are accepted
  }

  const connection = createConnectionRuntime({ storage });
  const gmcp = createGmcpCapture({ isActive: () => connection.getState().active });
  const character = createCharacterInfo(gmcp);
  const replies = createReplyCollector();
  const activity = createActivityLog();
  const sender = createSender({ isActive: () => connection.getState().active, collector: replies, activity });
  // nothing captured from the simulacrum outlives the connection (E2)
  const stopClearing = [
    connection.onDeactivate(() => gmcp.clear()),
    connection.onDeactivate(() => character.clear()),
    connection.onDeactivate(() => replies.cancel()),
    connection.onDeactivate(() => activity.clear()),
    connection.onDeactivate(() => sender.clearAvailable()),
  ];

  const onPageHide = (): void => runtime.dispose();
  win.addEventListener('pagehide', onPageHide);

  const runtime: SimulacrumAdminRuntime = {
    marker: SIMULACRUM_ADMIN_BUNDLE_MARKER,
    connection,
    gmcp,
    character,
    activity,
    sender,
    dispose() {
      win.removeEventListener('pagehide', onPageHide);
      stopClearing.forEach((stop) => stop());
      character.dispose();
      replies.dispose();
      gmcp.dispose();
      connection.dispose();
    },
  };
  return runtime;
}
