/**
 * The training pilot is always VISIBLE: the owner watches every screen of a training session, so a hidden or headless browser is never started.
 * `pilotLaunchOptions` is the only place the launch options are made, and it refuses any request for a hidden one (the flag, or the environment
 * variables the browser tooling honours). The window gets a real size so nothing is cropped on the owner's screen.
 */
export const PILOT_VIEWPORT = Object.freeze({ width: 1440, height: 900 });

const TRUTHY = /^(1|true|yes|on)$/i;

export function pilotLaunchOptions(argv = [], env = {}) {
  const asked = argv.some((arg) => /^--(headless|hidden)(=(1|true|yes|on))?$/i.test(arg)) || ['HEADLESS', 'PLAYWRIGHT_HEADLESS', 'PWHEADLESS'].some((key) => TRUTHY.test(env[key] ?? ''));
  if (asked) throw new Error('the training pilot is always visible: it never runs headless or hidden (the owner watches every screen)');
  return { headless: false, contextOptions: { viewport: { ...PILOT_VIEWPORT } } };
}
