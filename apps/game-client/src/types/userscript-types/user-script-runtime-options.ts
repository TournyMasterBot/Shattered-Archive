// apps\game-client\src\types\userscript-types\user-script-runtime-options.ts
import { ScriptErrorInfo } from './script-error-info';
import { SendCommandFn } from './send-command-function';

export interface UserScriptRuntimeOptions {
  sendCommand?: SendCommandFn;
  onScriptError?: (err: ScriptErrorInfo) => void;
  aliasSplitChar?: string;

  /**
   * Global variables assigned to languages
   */
  getGlobalVar?: (key: string) => unknown;
  setGlobalVar?: (key: string, value: unknown) => void;
  deleteGlobalVar?: (key: string) => void;

  /**
   * Named variables used for template expansion: "{NAME}"
   * (resolved at runtime; can change at any time)
   */
  getNamedVar?: (name: string) => string | undefined;
  setNamedVar?: (name: string, value: string) => void;
  deleteNamedVar?: (name: string) => void;
}
