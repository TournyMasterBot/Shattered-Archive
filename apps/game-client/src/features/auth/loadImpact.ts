// apps/game-client/src/features/auth/loadImpact.ts
//
// Decides what "Load from the cloud" will do to THIS connection, before it does it.
//
// Pure on purpose (no storage, no React): the account modal fetches the cloud first,
// summarizes both sides, and shows the user exactly what will be overwritten. Keeping
// the decision here means the confirm text and the apply step cannot disagree about
// what is replaced. Mirrors the mobile app's load-impact.ts.
//
// Rules that matter most:
//  - An EMPTY cloud never replaces local data. The server answers `[]` for an account
//    that has never saved, which is indistinguishable from "cleared", so treating it as
//    a replacement would silently wipe a client that simply has not uploaded yet.
//  - Parchment/notes/books and auto-leveling data are merge-only (nothing local is ever
//    deleted), so they never need a warning and are not part of this plan.

export interface LocalDataSummary {
  scripts: number;
  /** Installed plugin records (the web client keeps one list for every connection). */
  plugins: number;
  /** Global-script languages that hold source for this connection. */
  globalLanguages: string[];
}

export interface CloudDataSummary {
  scripts: number;
  plugins: number;
  /** Global-script languages that hold source in this connection's cloud bucket. */
  globalLanguages: string[];
  /**
   * Other servers' global-script buckets that exist in the cloud AND hold source locally
   * — loading replaces them too. Buckets that are empty locally are simply filled in.
   */
  replacedOtherGlobals: string[];
}

export interface LoadImpact {
  /** The cloud's scripts will replace this connection's. False when the cloud has none. */
  replaceScripts: boolean;
  replacePlugins: boolean;
  /** At least one cloud global-script bucket has source and will be applied. */
  replaceGlobals: boolean;
  /** Something on this client will change, so the user must be asked first. */
  needsConfirm: boolean;
  /** Local data that exists only here will be lost, so the warning is the strong one. */
  destructive: boolean;
  title: string;
  message: string;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function planCloudLoad(local: LocalDataSummary, cloud: CloudDataSummary): LoadImpact {
  const replaceScripts = cloud.scripts > 0;
  const replacePlugins = cloud.plugins > 0;
  const replaceGlobals = cloud.globalLanguages.length > 0 || cloud.replacedOtherGlobals.length > 0;

  const overwritesScripts = replaceScripts && local.scripts > 0;
  const overwritesPlugins = replacePlugins && local.plugins > 0;
  const overwritesGlobals =
    (cloud.globalLanguages.length > 0 && local.globalLanguages.length > 0) || cloud.replacedOtherGlobals.length > 0;
  const destructive = overwritesScripts || overwritesPlugins || overwritesGlobals;
  const needsConfirm = replaceScripts || replacePlugins || replaceGlobals;

  const lines: string[] = [];

  if (overwritesScripts) {
    lines.push(
      `${count(local.scripts, 'script')} on this connection will be REPLACED by the ${count(cloud.scripts, 'script')} saved in the cloud. ` +
        'Any script that exists only on this device will be permanently lost.',
    );
  } else if (replaceScripts) {
    lines.push(`${count(cloud.scripts, 'script')} from the cloud will be copied to this connection.`);
  } else if (local.scripts > 0) {
    lines.push(`The cloud has no scripts, so the ${count(local.scripts, 'script')} on this connection will be kept.`);
  }

  if (overwritesPlugins) {
    lines.push(
      `Your ${count(local.plugins, 'installed plugin')} and their settings will be REPLACED by the cloud's ${cloud.plugins}.`,
    );
  } else if (replacePlugins) {
    lines.push(`${count(cloud.plugins, 'plugin')} and their settings from the cloud will be installed.`);
  }

  if (cloud.globalLanguages.length > 0 && local.globalLanguages.length > 0) {
    lines.push(`Your global scripts (${local.globalLanguages.join(', ')}) will be REPLACED by the cloud's.`);
  } else if (cloud.globalLanguages.length > 0) {
    lines.push('Global scripts from the cloud will be copied to this connection.');
  }
  if (cloud.replacedOtherGlobals.length > 0) {
    lines.push(`Global scripts for other servers (${cloud.replacedOtherGlobals.join(', ')}) will also be REPLACED.`);
  }

  lines.push('Parchment, notes, books and auto-leveling data are merged in; nothing there is deleted.');
  if (destructive) lines.push("To keep this device's version, cancel and use Save to the cloud first.");

  return {
    replaceScripts,
    replacePlugins,
    replaceGlobals,
    needsConfirm,
    destructive,
    title: destructive ? 'Replace data on this connection?' : 'Load from the cloud?',
    message: lines.join('\n\n'),
  };
}

export interface SaveGuardInput {
  local: { scripts: number; plugins: number; hasGlobals: boolean };
  cloud: { scripts: number; plugins: number; hasGlobals: boolean };
}

/**
 * A Save uploads whole collections, so uploading an EMPTY one over a non-empty cloud
 * copy erases it. Returns one line per collection that would be erased (empty when the
 * save is safe), so the caller can ask before overwriting.
 */
export function savesThatWouldErase({ local, cloud }: SaveGuardInput): string[] {
  const lines: string[] = [];
  if (local.scripts === 0 && cloud.scripts > 0) {
    lines.push(`this connection has no scripts, so the ${count(cloud.scripts, 'script')} in the cloud would be erased`);
  }
  if (local.plugins === 0 && cloud.plugins > 0) {
    lines.push(`no plugins are installed here, so the ${count(cloud.plugins, 'plugin')} saved in the cloud would be erased`);
  }
  if (!local.hasGlobals && cloud.hasGlobals) {
    lines.push('this device has no global scripts, so the ones saved in the cloud would be erased');
  }
  return lines;
}

export interface LoadResultCounts {
  scripts: number;
  plugins: number;
  /** Languages applied for the current connection's bucket, plus any other buckets applied. */
  globalBuckets: number;
  parchment: number;
  notes: number;
  books: number;
  autolevelRecords: number;
}

/** What the user is told after a load. `changed` is false when nothing on this client was touched. */
export function describeLoadResult(
  plan: LoadImpact,
  counts: LoadResultCounts,
  localScripts: number,
): { changed: boolean; text: string } {
  const merged = counts.parchment + counts.notes + counts.books + counts.autolevelRecords;
  const changed = plan.replaceScripts || plan.replacePlugins || plan.replaceGlobals || merged > 0;

  if (!changed) {
    const kept =
      localScripts > 0
        ? ` The ${count(localScripts, 'script')} on this connection ${localScripts === 1 ? 'was' : 'were'} not touched.`
        : '';
    return {
      changed,
      text: `Nothing is saved to this account yet. Use Save on the client that has your scripts, then load again.${kept}`,
    };
  }

  const parts: string[] = [];
  if (plan.replaceScripts) parts.push(count(counts.scripts, 'script'));
  if (plan.replacePlugins) parts.push(count(counts.plugins, 'plugin config'));
  if (plan.replaceGlobals) parts.push(count(counts.globalBuckets, 'global-script set'));
  const applied = parts.length > 0 ? `Loaded ${parts.join(', ')}` : 'Loaded no scripts or plugins';
  return {
    changed,
    text:
      `${applied}; merged ${counts.parchment} parchment / ${counts.notes} note(s) / ${counts.books} book(s) ` +
      `and ${counts.autolevelRecords} auto-leveling record(s). Reloading to apply…`,
  };
}
