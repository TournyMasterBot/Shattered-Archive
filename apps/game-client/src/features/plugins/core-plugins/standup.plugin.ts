// apps\game-client\src\features\plugins\core-plugins\standup.plugin.ts
import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';

function stripAnsi(s: string): string {
  if (!s || !s.includes('\x1b')) return s;
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

/** Parse the patterns textarea into a trimmed, non-empty string array. */
function parsePatterns(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

export const DEFAULT_STANDUP_PATTERNS = [
  'knocking you senseless',
  'You fall to the ground',
  'You are stunned',
  'You are knocked down',
  'You lose your balance and fall',
  'You slip and fall',
].join('\n');

export function createStandupPlugin(): IPluginModule {
  return {
    manifest: {
      id: 'standup',
      name: 'Auto Standup',
      version: '0.1.0',
      description: 'Automatically stands up when knocked down. Configure the trigger phrases below.',
    },

    configSchema: {
      defaults: {
        patterns: DEFAULT_STANDUP_PATTERNS,
        standCommand: '~st',
        debug: false,
      },
      fields: [
        {
          key: 'patterns',
          type: 'textarea',
          label: 'Knockdown trigger phrases',
          description:
            'One phrase per line. When any line from the game contains a phrase, the stand command fires. Lines starting with # are ignored.',
          placeholder: 'knocking you senseless\nYou fall to the ground',
        },
        {
          key: 'standCommand',
          type: 'string',
          label: 'Stand command',
          description: 'Command sent to the game when a knockdown is detected.',
          placeholder: 'stand',
        },
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Logs each matched line to the script console.',
        },
      ],
    },

    onEvent: (api: PluginRuntimeApi, evt) => {
      if (evt?.name !== 'shatteredarchive:raw-data') return;

      const cfg = api.getConfig();
      const patterns = parsePatterns(cfg.patterns);
      if (patterns.length === 0) return;

      const p = evt.payload as any;
      if (p?.__fromPlugin) return;

      const raw = typeof p === 'string' ? p : String(p?.text ?? '');
      if (!raw) return;

      const line = stripAnsi(raw).toLowerCase();

      for (const pattern of patterns) {
        if (line.includes(pattern.toLowerCase())) {
          const cmd = typeof cfg.standCommand === 'string' && cfg.standCommand.trim() ? cfg.standCommand.trim() : '~st';

          if (cfg.debug) {
            api.log(`[AutoStandup] matched "${pattern}" → ${cmd}`);
          }

          api.sendCommand(cmd);
          return; // one match is enough
        }
      }
    },
  };
}
