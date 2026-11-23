import { expectTopSpacing, expectFieldGroup } from './browser-layout-checks.mjs';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function browserParticipantLinks({ browser, base, api, root, scratch, restart = async () => {} }) {
  await mkdir(scratch, { recursive: true });
  for (const locale of ['fr-CA', 'en-CA', 'es']) for (const width of [360, 1440]) {
    await restart();
    const t = JSON.parse(await readFile(path.join(root, `apps/web/src/i18n/locales/${locale}.json`), 'utf8'));
    const created = await api('POST', '/api/exchanges', { name: 'Participant links', organizerName: 'Alex', adminPassword: 'testpassword123' }, undefined, 201);
    const id = created.exchange.id, token = created.adminSessionToken;
    const context = await browser.newContext({ ignoreHTTPSErrors: true, locale, viewport: { width, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    try {
      await context.addInitScript(({ id, token, locale }) => {
        localStorage.setItem('locale', locale);
        localStorage.setItem('kado.adminSessions', JSON.stringify({ [id]: token }));
      }, { id, token, locale });
      const page = await context.newPage();
      const errors = [], dialogs = [];
      let acceptReplacement = false;
      page.on('pageerror', e => errors.push(e.message));
      page.on('dialog', async dialog => { dialogs.push(dialog.message()); if (acceptReplacement) await dialog.accept(); else await dialog.dismiss(); });
      await page.goto(`${base}/exchanges/${id}`);
      const input = page.locator('#new-participant-name');
      await expect(input).toBeVisible();
      const addGroup = page.locator('.input-group').filter({ has: input });
      await expectFieldGroup(addGroup);
      await expect(addGroup.locator('button')).toBeDisabled();
      await page.getByRole('button', { name: t.review.accessSaved, exact: true }).count().then(async count => {
        if (count) await page.getByRole('button', { name: t.review.accessSaved, exact: true }).click();
      });
      await expect(page.locator('#participants')).toContainText(t.exchangeDetail.linkNotGenerated);
      // A failed submission preserves the draft; Enter retries and resumes rapid entry.
      await page.route('**/api/exchanges/*/participants', route => route.request().method() === 'POST'
        ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_BUSY' } }) }) : route.continue());
      await input.fill('Blair'); await input.press('Enter');
      await expect(page.locator('#participants .alert-danger')).toBeVisible();
      await expect(input).toHaveValue('Blair');
      await expectFieldGroup(addGroup);
      await page.unroute('**/api/exchanges/*/participants');
      await input.press('Enter'); await expect(input).toHaveValue(''); await expect(input).toBeFocused();
      await input.fill('Casey'); await input.press('Enter'); await expect(input).toHaveValue(''); await expect(input).toBeFocused();
      await expect(page.locator('.modal.show')).toHaveCount(0);
      await expect(page.locator('#participants li')).toHaveCount(3);
      await expectFieldGroup(addGroup);
      await expectTopSpacing(page, page.locator('#detail'));
      await page.reload(); await expect(page.locator('#participants li')).toHaveCount(3);
      const row = page.locator('#participants li').filter({ has: page.locator('strong', { hasText: /^Blair$/ }) });
      await row.hover();
      await row.getByRole('button', { name: t.exchangeDetail.createLink, exact: true }).click();
      const modal = page.getByRole('dialog', { name: t.exchangeDetail.linkModal.title });
      await expect(modal).toBeVisible();
      assert.deepEqual(dialogs, [], 'First generation never warns about replacing a link');
      await expectFieldGroup(modal.locator('.input-group'));
      await modal.getByRole('button', { name: t.actions.copy, exact: true }).click();
      await page.screenshot({ path: path.join(scratch, `copy-group-${locale}-${width}.png`), fullPage: true });
      const first = await modal.locator('input').inputValue();
      assert(first.startsWith(base + '/p/'));
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(first);
      await modal.getByRole('button', { name: t.actions.close, exact: true }).click();
      await page.reload(); await expect(row).not.toContainText(t.exchangeDetail.linkNotGenerated);
      await row.hover(); await row.getByRole('button', { name: t.exchangeDetail.generateLink, exact: true }).click();
      await expect.poll(() => dialogs.length).toBe(1);
      await expect(modal).not.toBeVisible();
      await api('GET', '/api' + new URL(first).pathname);
      acceptReplacement = true;
      await row.getByRole('button', { name: t.exchangeDetail.generateLink, exact: true }).click();
      await expect(modal).toBeVisible();
      const replacement = await modal.locator('input').inputValue();
      assert.notEqual(replacement, first);
      await api('GET', '/api' + new URL(first).pathname, undefined, undefined, 404);
      await api('GET', '/api' + new URL(replacement).pathname);
      await modal.getByRole('button', { name: t.actions.close, exact: true }).click();
      await page.reload(); await expect(row).toBeVisible();
      const audit = await new AxeBuilder({ page }).options({ preload: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(audit.violations.map(v => v.id), []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(scratch, `participant-links-${locale}-${width}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`Participant links: ${locale} ${width}px passed`);
    } finally {
      await context.close();
      await api('DELETE', `/api/exchanges/${id}`, undefined, token, 204);
    }
  }
}
