import { getGlobalVarsSnapshot } from "./globalScriptsStore";

export function getGlobalVar(connectionId: string | null | undefined, keyName: string): unknown {
  const vars = getGlobalVarsSnapshot(connectionId);
  return vars[keyName];
}