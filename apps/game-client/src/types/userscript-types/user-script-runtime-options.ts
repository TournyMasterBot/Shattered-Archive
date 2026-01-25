// apps\game-client\src\types\userscript-types\user-script-runtime-options.ts
import { ScriptErrorInfo } from './script-error-info';
import { SendCommandFn } from './send-command-function';

export interface UserScriptRuntimeOptions {
  sendCommand?: SendCommandFn;
  onScriptError?: (err: ScriptErrorInfo) => void;
  aliasSplitChar?: string;
}
