/**
 * The Copilot window in the game client, driven the way the owner would: open it from the Game menu, switch Copilot on, turn Claude training on in
 * the settings, read the suggestion cards, and approve, correct or reject them with the same buttons. Selectors are the window's own labels
 * (apps/game-client/src/components/CopilotWindow.tsx, CopilotSettings.tsx, CopilotReview.tsx).
 */
/* global document */
import crypto from 'node:crypto';

const dialog = (page) => page.getByRole('dialog', { name: 'Copilot' });

/** Opens the window, switches Copilot on, and turns Claude training on. Throws (with what it saw) when the banner does not appear. */
export async function startTraining(page) {
  await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
  await page.getByText(/^Copilot…/).first().click();
  const win = dialog(page);
  await win.waitFor({ state: 'visible' });
  const sw = win.getByRole('switch', { name: 'Copilot' });
  if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
  await page.waitForFunction(() => /Online|Stale/.test(document.querySelector('[role="dialog"] [role="status"]')?.textContent ?? ''), null, { timeout: 30000 });
  await win.getByRole('button', { name: 'Settings' }).click();
  const toggle = win.getByLabel('Claude training');
  await toggle.waitFor({ state: 'visible', timeout: 30000 }); // shown only while the server says the connection is the Simulacrum's
  if (!(await toggle.isChecked())) await toggle.click();
  await win.getByLabel('Claude training is on').waitFor({ state: 'visible', timeout: 15000 });
  await win.getByRole('button', { name: 'Suggestions' }).click();
}

/** Turns training off (best effort: it also turns itself off when the connection closes). */
export async function stopTraining(page) {
  try {
    const win = dialog(page);
    await win.getByRole('button', { name: 'Settings' }).click();
    const toggle = win.getByLabel('Claude training');
    if (await toggle.isChecked()) await toggle.click();
  } catch {
    /* the window may be gone already */
  }
}

/** The suggestion cards on screen, each as plain data with a stable id (the window shows none: a hash of what the card says). */
export async function readCards(page) {
  const cards = dialog(page).locator('ul[aria-label="Suggestions"] > li');
  const count = await cards.count();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const card = cards.nth(i);
    const chips = await card.locator('[class*="chip"]').allInnerTexts();
    const command = (await card.locator('code').first().innerText()).trim();
    const rationale = (await card.locator('p').first().innerText()).trim();
    const confidence = (await card.locator('[class*="confidence"]').first().innerText()).replace(/^Confidence\s*/, '').trim();
    const situation = (await card.locator('details span').first().textContent())?.trim() ?? '';
    const id = crypto.createHash('sha256').update([command, rationale, situation].join('\n')).digest('hex').slice(0, 12);
    out.push({ id, sphere: chips[0] ?? '', kind: chips[1] ?? '', confidence, command, rationale, situation });
  }
  return out;
}

/** Applies a validated answer to the card with this command, with the window's own buttons. */
export async function applyAnswer(page, card, answer) {
  const item = dialog(page).locator(`ul[aria-label="Suggestions"] > li[aria-label="Suggestion ${card.command.replace(/"/g, '\\"')}"]`).first();
  if (answer.action === 'approve') {
    await item.getByRole('button', { name: 'Approve' }).click();
    return;
  }
  if (answer.action === 'correct') {
    await item.getByRole('button', { name: 'Correct' }).click();
    await item.getByLabel('Command to send instead').fill(answer.command);
    await item.getByLabel(/^Why/).fill(answer.why);
    await item.getByRole('button', { name: 'Send correction' }).click();
    return;
  }
  await item.getByRole('button', { name: 'Reject' }).first().click();
  await item.getByLabel(/^Why/).fill(answer.why);
  await item.getByRole('button', { name: 'Reject' }).last().click();
}
