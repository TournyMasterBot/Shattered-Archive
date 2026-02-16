// apps\game-client\src\types\userscript-types\script-error-info.ts
import { UserScriptKind } from './user-script-kind';

export interface ScriptErrorInfo {
  scriptId: string;
  scriptName: string;
  kind: UserScriptKind;
  message: string;
  stack?: string;
  timestamp: number;
}
