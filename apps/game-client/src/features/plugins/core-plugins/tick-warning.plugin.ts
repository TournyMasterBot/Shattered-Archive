// apps\game-client\src\features\plugins\core-plugins\tick-warning.plugin.ts
import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';

/**
 * Tick Warning — writes a colored line into the terminal a few seconds before
 * the next game tick. Threshold, message, and color are configurable; the
 * defaults reproduce the original built-in warning ("Tick in 5 seconds!" in red).
 *
 * Reactive shape: it keeps its own one-shot timer rather than reading the HUD's
 * tickStore, because tickStore only runs while a HUD component is subscribed —
 * this must work under any layout. `game:tick` (re)arms the timer, so it fires
 * at most once per tick cycle by construction, and a connection close disarms it.
 *
 * Timing matches the HUD countdown badge: tickStore shows Math.round(duration -
 * elapsed), so the badge first reads N at (duration - N - 0.5)s elapsed. The
 * warning fires at that same instant so the message and the badge agree.
 */

/** Same fixed tick length the HUD countdown assumes (tickStore DEFAULT_TICK_DURATION). */
const TICK_DURATION_SEC = 41;

const DEFAULT_THRESHOLD_SEC = 5;
const DEFAULT_MESSAGE = 'Tick in {seconds} seconds!';
const DEFAULT_COLOR = '{R';

/** DSL palette (userScripts/dslToAnsi.ts), minus {D (black) which is invisible on the terminal. */
const COLOR_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Light Red (default)', value: '{R' },
  { label: 'Red', value: '{r' },
  { label: 'Orange', value: '{o' },
  { label: 'Yellow', value: '{y' },
  { label: 'Light Yellow', value: '{Y' },
  { label: 'Green', value: '{g' },
  { label: 'Light Green', value: '{G' },
  { label: 'Cyan', value: '{c' },
  { label: 'Light Cyan', value: '{C' },
  { label: 'Blue', value: '{b' },
  { label: 'Light Blue', value: '{B' },
  { label: 'Purple', value: '{u' },
  { label: 'Magenta', value: '{m' },
  { label: 'Light Magenta', value: '{M' },
  { label: 'Pink', value: '{p' },
  { label: 'Brown', value: '{n' },
  { label: 'Grey', value: '{w' },
  { label: 'White', value: '{W' },
];

const VALID_COLORS = new Set(COLOR_OPTIONS.map((o) => o.value));

function resolveThreshold(raw: unknown): number {
  const n = typeof raw === 'number' ? Math.round(raw) : NaN;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_THRESHOLD_SEC;
  return Math.min(n, TICK_DURATION_SEC - 1);
}

function resolveMessage(raw: unknown): string {
  return typeof raw === 'string' && raw.trim() ? raw : DEFAULT_MESSAGE;
}

function resolveColor(raw: unknown): string {
  return typeof raw === 'string' && VALID_COLORS.has(raw) ? raw : DEFAULT_COLOR;
}

export function createTickWarningPlugin(): IPluginModule {
  return {
    manifest: {
      id: 'tick-warning',
      name: 'Tick Warning',
      version: '0.1.0',
      description:
        'Writes a colored warning into the terminal a few seconds before the next tick. Defaults to "Tick in 5 seconds!" in light red; threshold, message, and color are configurable.',
    },

    configSchema: {
      defaults: {
        warningThresholdSec: DEFAULT_THRESHOLD_SEC,
        warningMessage: DEFAULT_MESSAGE,
        warningColor: DEFAULT_COLOR,
      },
      fields: [
        {
          key: 'warningThresholdSec',
          type: 'number',
          label: 'Warn at (seconds before tick)',
          description: `Whole seconds remaining when the warning appears (1–${TICK_DURATION_SEC - 1}). Takes effect from the next tick.`,
          min: 1,
          max: TICK_DURATION_SEC - 1,
          step: 1,
        },
        {
          key: 'warningMessage',
          type: 'string',
          label: 'Warning message',
          description: 'Text to show. {seconds} is replaced with the threshold. DSL color codes are allowed; a blank message uses the default.',
          placeholder: DEFAULT_MESSAGE,
        },
        {
          key: 'warningColor',
          type: 'select',
          label: 'Warning color',
          description: 'DSL color applied to the whole message.',
          options: COLOR_OPTIONS,
        },
      ],
    },

    onEnable(api: PluginRuntimeApi) {
      let timerId: ReturnType<typeof setTimeout> | null = null;

      const disarm = () => {
        if (timerId != null) {
          clearTimeout(timerId);
          timerId = null;
        }
      };

      const arm = () => {
        disarm();

        // Read config fresh on every cycle so live edits apply from the next tick.
        const cfg = api.getConfig();
        const threshold = resolveThreshold(cfg.warningThresholdSec);
        const message = resolveMessage(cfg.warningMessage).split('{seconds}').join(String(threshold));
        const color = resolveColor(cfg.warningColor);

        const delayMs = (TICK_DURATION_SEC - threshold - 0.5) * 1000;
        timerId = setTimeout(() => {
          timerId = null;
          api.writeTerminal(`${color}${message}{x`);
        }, delayMs);
      };

      const offTick = api.onEvent('game:tick', arm);
      const offClose = api.onEvent('game:remote-server:close', disarm);

      return () => {
        disarm();
        offTick();
        offClose();
      };
    },
  };
}
