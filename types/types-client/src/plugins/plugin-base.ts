// types\types-client\src\plugins\plugin-base.ts
export type PluginId = string;

export type PluginLanguage = 'javascript' | 'typescript' | 'python' | 'lua';

export type PluginEventName = string;

export type PluginFieldType = 'string' | 'number' | 'boolean' | 'select' | 'textarea';

export interface PluginConfigFieldBase {
  key: string;
  label: string;
  description?: string;
  type: PluginFieldType;
}

export interface PluginConfigFieldNumber extends PluginConfigFieldBase {
  type: 'number';
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  optional?: boolean; // if true, blank => undefined
}

export interface PluginConfigFieldString extends PluginConfigFieldBase {
  type: 'string';
  placeholder?: string;
  optional?: boolean;
}

export interface PluginConfigFieldTextarea extends PluginConfigFieldBase {
  type: 'textarea';
  placeholder?: string;
  optional?: boolean;
}

export interface PluginConfigFieldBoolean extends PluginConfigFieldBase {
  type: 'boolean';
}

export interface PluginConfigFieldSelect extends PluginConfigFieldBase {
  type: 'select';
  options: Array<{ label: string; value: string }>;
  optional?: boolean;
}

export type PluginConfigField =
  | PluginConfigFieldNumber
  | PluginConfigFieldString
  | PluginConfigFieldTextarea
  | PluginConfigFieldBoolean
  | PluginConfigFieldSelect;

export interface PluginConfigSchema {
  /** Default values merged into userConfig when missing. */
  defaults?: Record<string, unknown>;

  /** Fields used by the base UI to render a config editor. */
  fields: PluginConfigField[];
}

export interface PluginManifest {
  id: PluginId;
  name: string;
  version: string;
  author?: string;
  description?: string;
  supportsExport?: boolean;
}

export interface PluginBundledScript {
  kind: 'trigger' | 'alias' | 'timer';
  name: string;
  enabledByDefault: boolean;
  language: PluginLanguage;

  // trigger
  eventName?: string;
  matchText?: string;

  // alias
  alias?: string;

  // timer
  intervalMs?: number;

  source: string;
}

export interface PluginAssets {
  css?: string;
  scripts?: PluginBundledScript[];
}

export interface PluginExportInfo {
  format: 'shattered-archive-plugin-v1';
  pluginId: PluginId;
  name: string;
  version: string;
  description?: string;
  payload: Record<string, unknown>;
}

export interface PluginEvent {
  name: PluginEventName;
  payload?: unknown;
}

/**
 * API exposed to plugin code at runtime.
 * Base system provides default behaviors so plugin authors don't have to.
 */
export interface PluginRuntimeApi {
  connectionId: string;
  pluginId: PluginId;

  // compat with your scripting style
  sendCommand: (cmd: string) => void;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;

  // event helper (browser events)
  onEvent: (eventName: string, handler: (payload: unknown) => void) => () => void;

  // http helper
  httpGetJson: (
    url: string,
    options?: {
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: unknown;
    },
  ) => Promise<unknown>;

  // config (host-provided)
  getConfig: () => Record<string, unknown>;
  setConfig: (next: Record<string, unknown>) => void;
  updateConfig: (patch: Record<string, unknown>) => void;
}

/**
 * Self-contained plugin module (NO React).
 * Base UI uses configSchema to render configuration.
 */
export interface IPluginModule {
  manifest: PluginManifest;

  assets?: PluginAssets;

  /** Optional schema so base UI can render configuration for this plugin */
  configSchema?: PluginConfigSchema;

  /** Called when plugin is enabled */
  onEnable?: (api: PluginRuntimeApi) => void | (() => void);

  /** Called when plugin is disabled */
  onDisable?: (api: PluginRuntimeApi) => void;

  /** Called for each routed event (optional “bus” pattern) */
  onEvent?: (api: PluginRuntimeApi, evt: PluginEvent) => void;

  /** Optional export */
  exportPlugin?: () => PluginExportInfo;
}

/**
 * Stored install record (per connection) inside your game-client.
 */
export interface InstalledPluginRecord {
  id: PluginId;
  enabled: boolean;
  installedAt: number;
  userConfig: Record<string, unknown>;
}
