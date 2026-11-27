// Phase 12 UI check, driven like a person: open the Game menu, choose Copilot…, look at the window, drag it by its title,
// resize it by its corner, change the mode, and confirm the page behind it still responds. NOT connected to any game server.
// Navigates only to the dev stack's game client (the browser-test harness allowlist enforces *.shatteredarchive.dev).
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const gameMenu = (page) => page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first();

const sizes = [
  { name: '1440x900', viewport: { width: 1440, height: 900 } },
  { name: '900x600', viewport: { width: 900, height: 600 } },
];

for (const size of sizes) {
  console.log(`\n=== viewport ${size.name}`);
  await withPage(
    'https://game-client.shatteredarchive.dev/',
    async (page) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.waitForLoadState('networkidle');
      await shot(page, `phase-12_${size.name}_00-before.png`);

      // open the menu the way a person does
      await gameMenu(page).click();
      const item = page.getByText('Copilot…', { exact: true });
      check(`${size.name}: the Game menu has a Copilot… item`, await item.isVisible());
      await item.click();

      const dialog = page.getByRole('dialog', { name: 'Copilot' });
      await dialog.waitFor({ state: 'visible' });
      check(`${size.name}: the window opens`, await dialog.isVisible());
      check(`${size.name}: no aria-modal`, (await dialog.getAttribute('aria-modal')) === null);
      const z = await dialog.evaluate((el) => getComputedStyle(el).zIndex);
      check(`${size.name}: z-index 4900`, z === '4900', z);
      const bg = await page.evaluate(() => document.querySelectorAll('[class*="backdrop"], [class*="overlay"]').length);
      check(`${size.name}: no backdrop`, bg === 0);

      // the status indicator reaches the server through nginx
      await page.waitForFunction(() => /Online|Offline/.test(document.querySelector('[role="dialog"] [role="status"]')?.textContent ?? ''), null, { timeout: 15000 });
      const status = (await page.getByRole('dialog', { name: 'Copilot' }).getByRole('status').textContent())?.trim();
      check(`${size.name}: status indicator shows a result`, !!status, status);
      await shot(page, `phase-12_${size.name}_01-window-open.png`);

      // drag by the title
      const before = await dialog.boundingBox();
      const title = dialog.getByText('Copilot', { exact: true }).first();
      const tb = await title.boundingBox();
      await page.mouse.move(tb.x + 5, tb.y + 5);
      await page.mouse.down();
      await page.mouse.move(tb.x - 160, tb.y + 140, { steps: 8 });
      await page.mouse.up();
      const dragged = await dialog.boundingBox();
      check(`${size.name}: dragging the title moves the window`, Math.abs(dragged.x - before.x) > 100 && Math.abs(dragged.y - before.y) > 80, `${Math.round(before.x)},${Math.round(before.y)} -> ${Math.round(dragged.x)},${Math.round(dragged.y)}`);

      // drag far past each edge: it stays inside the viewport
      await page.mouse.move(dragged.x + 20, dragged.y + 10);
      await page.mouse.down();
      await page.mouse.move(-400, -400, { steps: 6 });
      await page.mouse.up();
      const topLeft = await dialog.boundingBox();
      check(`${size.name}: cannot be dragged off the top-left`, topLeft.x >= 0 && topLeft.y >= 0, `${topLeft.x},${topLeft.y}`);
      await page.mouse.move(topLeft.x + 20, topLeft.y + 10);
      await page.mouse.down();
      await page.mouse.move(size.viewport.width + 400, size.viewport.height + 400, { steps: 6 });
      await page.mouse.up();
      const bottomRight = await dialog.boundingBox();
      check(
        `${size.name}: cannot be dragged off the bottom-right`,
        bottomRight.x + bottomRight.width <= size.viewport.width + 1 && bottomRight.y + bottomRight.height <= size.viewport.height + 1,
        `${bottomRight.x + bottomRight.width},${bottomRight.y + bottomRight.height}`,
      );

      // resize by the corner (move the window back to a roomy spot first)
      await page.mouse.move(bottomRight.x + 20, bottomRight.y + 10);
      await page.mouse.down();
      await page.mouse.move(120, 80, { steps: 8 });
      await page.mouse.up();
      const placed = await dialog.boundingBox();
      const corner = { x: placed.x + placed.width - 6, y: placed.y + placed.height - 6 };
      await page.mouse.move(corner.x, corner.y);
      await page.mouse.down();
      await page.mouse.move(corner.x + 200, corner.y + 120, { steps: 8 });
      await page.mouse.up();
      const grown = await dialog.boundingBox();
      check(`${size.name}: the corner handle resizes`, grown.width > placed.width + 100 && grown.height > placed.height + 60, `${Math.round(placed.width)}x${Math.round(placed.height)} -> ${Math.round(grown.width)}x${Math.round(grown.height)}`);
      const c2 = { x: grown.x + grown.width - 6, y: grown.y + grown.height - 6 };
      await page.mouse.move(c2.x, c2.y);
      await page.mouse.down();
      await page.mouse.move(c2.x - 2000, c2.y - 2000, { steps: 6 });
      await page.mouse.up();
      const shrunk = await dialog.boundingBox();
      check(`${size.name}: it cannot be made smaller than the minimum`, shrunk.width >= 359 && shrunk.height >= 219, `${Math.round(shrunk.width)}x${Math.round(shrunk.height)}`);
      const closeBox = await dialog.getByRole('button', { name: 'Close Copilot' }).boundingBox();
      const winBox = await dialog.boundingBox();
      check(`${size.name}: at the minimum size the close button is fully inside the window`, closeBox.x >= winBox.x && closeBox.x + closeBox.width <= winBox.x + winBox.width + 0.5, `close right edge ${Math.round(closeBox.x + closeBox.width)} vs window ${Math.round(winBox.x + winBox.width)}`);
      await shot(page, `phase-12_${size.name}_02-moved-resized.png`);

      // mode picker, by keyboard like a person with the select focused
      const select = dialog.getByLabel('Mode');
      await select.selectOption('battle');
      check(`${size.name}: the mode can be changed`, (await select.inputValue()) === 'battle');
      await select.focus();
      await page.keyboard.press('Tab');
      await shot(page, `phase-12_${size.name}_03-focus-visible.png`);

      // the page behind the window still takes clicks: the menu bar opens again while the window stays
      await gameMenu(page).click();
      check(`${size.name}: the menu behind the window still opens`, await page.getByText('Autopilot…', { exact: true }).isVisible());
      await page.keyboard.press('Escape');
      await page.mouse.click(5, size.viewport.height - 5);

      // reload: geometry and mode are remembered
      const geometry = await dialog.boundingBox();
      await page.reload({ waitUntil: 'networkidle' });
      await gameMenu(page).click();
      await page.getByText('Copilot…', { exact: true }).click();
      const again = page.getByRole('dialog', { name: 'Copilot' });
      await again.waitFor({ state: 'visible' });
      const restored = await again.boundingBox();
      check(`${size.name}: position and size are restored after a reload`, Math.abs(restored.x - geometry.x) <= 1 && Math.abs(restored.y - geometry.y) <= 1 && Math.abs(restored.width - geometry.width) <= 1, `${Math.round(restored.x)},${Math.round(restored.y)}`);
      check(`${size.name}: the mode is restored after a reload`, (await again.getByLabel('Mode').inputValue()) === 'battle');

      // Escape inside the window and the close button
      await again.getByLabel('Mode').focus();
      await page.keyboard.press('Escape');
      check(`${size.name}: Escape inside the window closes it`, await again.isHidden());
      await gameMenu(page).click();
      await page.getByText('Copilot…', { exact: true }).click();
      await page.getByRole('button', { name: 'Close Copilot' }).click();
      check(`${size.name}: the close button closes it`, await page.getByRole('dialog', { name: 'Copilot' }).isHidden());

      check(`${size.name}: no page errors`, errors.length === 0, errors.join(' | ').slice(0, 200));
    },
    { contextOptions: { viewport: size.viewport, ignoreHTTPSErrors: true } },
  );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
