import { expectTopSpacing, expectFieldGroup } from './browser-layout-checks.mjs';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function browserRemindersExclusions({ browser, base, api, root, scratch, restart = async () => {} }) {
  await mkdir(scratch, { recursive: true });
  for (const locale of ['fr-CA', 'en-CA', 'es']) for (const width of [360, 1440]) {
    await restart();
    const t = JSON.parse(await readFile(path.join(root, `apps/web/src/i18n/locales/${locale}.json`), 'utf8'));
    const created = await api('POST', '/api/exchanges', { name: 'Rappels et exclusions', organizerParticipates: false, lockSuggestionsAfterDraw: false, adminPassword: 'password123' }, undefined, 201);
    const id = created.exchange.id, token = created.adminSessionToken, url = `/api/exchanges/${id}`;
    const members = [];
    for (const name of ['Alex', 'Camille avec un nom particulièrement long pour vérifier le retour à la ligne', 'Dominique']) {
      members.push((await api('POST', `${url}/participants`, { name }, token, 201)).participant);
    }
    const context = await browser.newContext({ ignoreHTTPSErrors: true, locale, viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    try {
      await context.addInitScript(({ id, token, locale }) => {
        localStorage.setItem('locale', locale);
        localStorage.setItem('kado.adminSessions', JSON.stringify({ [id]: token }));
      }, { id, token, locale });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      async function gap(first, second) {
        const a = await first.boundingBox(), b = await second.boundingBox();
        assert(a && b); assert(Math.abs(b.y - a.y - a.height - 24) < 1, `Expected 24px gap, got ${b.y - a.y - a.height}`);
      }
      async function audit(label) {
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label);
        const result = await new AxeBuilder({ page }).options({ preload: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        assert.deepEqual(result.violations.map(v => v.id), [], label);
      }
      await page.goto(`${base}/exchanges/${id}`);
      const reminder = page.locator('.access-reminder');
      await expect(reminder).toBeVisible();
      await expectTopSpacing(page, reminder);
      await expectFieldGroup(reminder.locator('.input-group'));
      await page.reload(); await expectTopSpacing(page, reminder);
      await gap(reminder, page.locator('#detail'));
      await page.screenshot({ path: path.join(scratch, `reminder-organizer-${locale}-${width}.png`), fullPage: true });
      // Copy through the real handler with a deterministic clipboard sink in headless Chromium.
      await page.evaluate(() => { window.__copied = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copied = value; } } }); });
      await reminder.getByRole('button', { name: t.actions.copy, exact: true }).click();
      assert.equal(await page.evaluate(() => window.__copied), `${base}/exchanges/${id}`);
      const top = (await reminder.boundingBox()).y;
      await reminder.locator('.access-reminder-confirm').click();
      await expect(reminder).toHaveCount(0);
      assert(Math.abs((await page.locator('#detail').boundingBox()).y - top) < 1, 'No empty flex item after dismissal');
      await expectTopSpacing(page, page.locator('.exchange-header'));
      await page.reload(); await expect(reminder).toHaveCount(0);
      await expectTopSpacing(page, page.locator('.exchange-header'));
      const editor = page.getByRole('dialog', { name: t.exchangeDetail.editModal.title });
      const section = editor.locator('.participant-exclusions');
      async function edit() {
        const row = page.locator('#participants li').filter({ hasText: 'Alex' });
        await row.hover(); await row.getByRole('button', { name: t.actions.edit, exact: true }).click();
        await expect(section).toBeVisible();
      }
      async function close() { await editor.locator('.participant-close').click(); await expect(editor).toBeHidden(); }
      await edit();
      await expect(section).toContainText(t.review.noParticipantExclusions);
      const select = section.locator('select'), add = section.getByRole('button', { name: t.actions.add, exact: true });
      const a = await select.boundingBox(), b = await add.boundingBox();
      assert(Math.abs(a.y - b.y) < 1 && Math.abs(a.height - b.height) < 1 && b.x >= a.x + a.width - 2, 'Aligned select and add button');
      await expectFieldGroup(section.locator('.input-group'));
      await select.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(scratch, `exclusions-add-${locale}-${width}.png`), fullPage: true });
      await select.focus(); await select.selectOption(members[1].id); await select.press('Tab'); await expect(add).toBeFocused();
      await add.press('Enter'); await expect(section.locator('li')).toHaveCount(1);
      await select.selectOption(members[2].id);
      await expect(select).toHaveValue(members[2].id);
      const added = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/exclusions'));
      await add.click(); assert.equal((await added).status(), 201);
      await expect(section.locator('li')).toHaveCount(2);
      await expect(select).toBeDisabled(); await expect(add).toBeDisabled();
      await expectFieldGroup(section.locator('.input-group'));
      await audit('Exclusions with long names');
      await page.screenshot({ path: path.join(scratch, `exclusions-${locale}-${width}.png`), fullPage: true });
      await close(); await page.reload(); await edit(); await expect(section.locator('li')).toHaveCount(2);
      // A failed removal retains the entry; retry uses the real API.
      await page.route('**/exclusions/*', route => route.request().method() === 'DELETE' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_BUSY' } }) }) : route.continue());
      const failed = page.waitForResponse(r => r.request().method() === 'DELETE' && r.url().includes('/exclusions/'));
      await section.locator('li button').first().click(); assert.equal((await failed).status(), 503);
      await expect(section.locator('li')).toHaveCount(2);
      await expect(page.locator('.toast-container').getByRole('alert')).toBeVisible();
      await expect(section.locator('li button').first()).toBeEnabled();
      await page.unroute('**/exclusions/*');
      const retry = page.waitForResponse(r => r.request().method() === 'DELETE' && r.url().includes('/exclusions/'));
      await section.locator('li button').first().click(); assert.equal((await retry).status(), 204);
      await expect(section.locator('li')).toHaveCount(1);
      await section.locator('li button').first().click(); await expect(section.locator('li')).toHaveCount(0);
      await close(); await page.reload(); await edit(); await expect(section).toContainText(t.review.noParticipantExclusions);
      await select.selectOption(members[1].id); await add.click(); await expect(section.locator('li')).toHaveCount(1); await close();
      await api('POST', `${url}/draw`, undefined, token);
      await page.reload(); await edit(); await expect(section.locator('form')).toHaveCount(0); await expect(section.locator('li button')).toBeDisabled(); await close();
      await api('POST', `${url}/draw/cancel`, undefined, token);
      const personal = await api('POST', `${url}/participants/${members[0].id}/access/regenerate`, {}, token, 201);
      await page.goto(base + personal.accessLink); await expect(reminder).toBeVisible();
      await expectTopSpacing(page, page.locator('.exchange-header'));
      await page.reload(); await expect(reminder).toBeVisible();
      await expectTopSpacing(page, page.locator('.exchange-header'));
      await gap(page.locator('.exchange-header'), reminder);
      await gap(reminder, page.locator('.participant-self-form'));
      await audit('Participant reminder');
      await page.screenshot({ path: path.join(scratch, `reminder-participant-${locale}-${width}.png`), fullPage: true });
      await reminder.locator('.access-reminder-confirm').click(); await expect(reminder).toHaveCount(0);
      await gap(page.locator('.exchange-header'), page.locator('.participant-self-form'));
      await expectTopSpacing(page, page.locator('.exchange-header'));
      await page.reload(); await expect(reminder).toHaveCount(0);
      await expectTopSpacing(page, page.locator('.exchange-header'));
      await api('PUT', url, { eventDate: '2000-01-01' }, token);
      assert.equal((await api('GET', url, undefined, token)).isArchived, true);
      await page.goto(`${base}/exchanges/${id}`);
      const archivedRow = page.locator('#participants li').filter({ hasText: 'Alex' });
      await archivedRow.hover();
      await expect(archivedRow.getByRole('button', { name: t.actions.edit, exact: true })).toBeDisabled();
      assert.deepEqual(errors, []);
      console.log(`Reminders/exclusions ${locale} ${width}px: spacing, copy, dismissal, persistence, keyboard, errors, draw/archive locks and axe passed`);
    } finally { await context.close(); }
  }
}
