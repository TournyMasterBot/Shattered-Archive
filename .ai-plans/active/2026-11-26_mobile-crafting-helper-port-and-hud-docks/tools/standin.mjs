// Shared by the web live checks: serve the BUILT game client to the browser and stand in for the game proxy.
//
// The page is opened on the local nginx (loopback), then every static file is answered from apps/game-client/dist
// and /ws/game is answered here, so no container is rebuilt and no game server is contacted. Build first:
//   pnpm --filter @shatteredarchive/game-client build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ORIGIN = 'https://localhost';
export const here = path.dirname(fileURLToPath(import.meta.url));
export const shots = path.resolve(here, '../screenshots/incremental');
export const SLUG = '2026-11-26_mobile-crafting-helper-port-and-hud-docks';
export const contextOptions = { viewport: { width: 1500, height: 900 }, ignoreHTTPSErrors: true };

const dist = path.resolve(here, '../../../../apps/game-client/dist');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm' };

/** Install the stand-in, seed local storage, reload into the build under test. */
export async function standIn(page, storage = {}) {
  let socket = null;
  const game = {
    /** commands the page sent, since the last clear() */
    sent: [],
    clear: () => {
      game.sent.length = 0;
    },
    count: (cmd) => game.sent.filter((c) => c === cmd).length,
    socket: () => socket,
    raw: (data) => socket.send(JSON.stringify({ type: 'raw', data })),
    loginData: () => socket.send(JSON.stringify({ type: 'gmcp', data: 'login_data {"name":"Testchar","level":10}' })),
    terminalText: () => page.locator('body').innerText(),
  };

  await page.routeWebSocket('**/ws/game', (ws) => {
    socket = ws;
    ws.onMessage((message) => {
      const msg = JSON.parse(String(message));
      if (msg.type === 'data') game.sent.push(msg.data);
      if (msg.type === 'connect') ws.send(JSON.stringify({ type: 'raw', data: 'Stand-in game: connected.\n\r' }));
    });
  });

  await page.route(`${ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const file = path.join(dist, rel);
    if (!file.startsWith(dist) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.continue();
    await route.fulfill({ body: fs.readFileSync(file), contentType: TYPES[path.extname(file)] ?? 'application/octet-stream' });
  });

  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
  }, storage);
  await page.reload();
  await page.waitForTimeout(2500);

  // "dsl-mud" in the name selects the DSL per-connection data, and .invalid never resolves should the interception fail
  game.connect = async () => {
    await page.locator('xpath=//div[normalize-space(text())="File"]').first().click();
    await page.locator('xpath=//div[normalize-space(text())="Connect…"]').first().click();
    await page.getByPlaceholder('e.g. dsl-mud.org').fill('dsl-mud.standin.invalid');
    await page.getByPlaceholder('e.g. 4000').fill('4000');
    await page.getByRole('button', { name: /^Connect/ }).first().click();
    await page.waitForTimeout(800);
    const close = page.getByRole('button', { name: 'Close' });
    if (await close.count()) await close.first().click().catch(() => {});
  };

  return game;
}

export function checker() {
  const failures = [];
  const check = (ok, text) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
    if (!ok) failures.push(text);
  };
  const finish = () => {
    console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
    process.exit(failures.length ? 1 : 0);
  };
  return { check, finish };
}
