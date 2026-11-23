import { expectTopSpacing, expectFieldGroup } from './browser-layout-checks.mjs';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Called only by the isolated acceptance suites, with their disposable API/database.
export async function browserCreation({ browser, base, api, root, scratch, restart = async () => {} }) {
  const output = path.join(scratch, 'creation-access');
  await mkdir(output, { recursive: true });
  for (const locale of ['fr-CA', 'en-CA', 'es']) {
    const messages = JSON.parse(await readFile(path.join(root, 'apps/web/src/i18n/locales', `${locale}.json`), 'utf8'));
    for (const width of [360, 1440]) {
    await restart();
      const context = await browser.newContext({
        ignoreHTTPSErrors: true, locale, reducedMotion: 'reduce', viewport: { width, height: 1000 },
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // An unexpected discard confirmation after success must fail, not silently accept.
      const unexpectedDialog = dialog => { errors.push(`Unexpected dialog: ${dialog.type()}`); void dialog.dismiss(); };
      page.on('dialog', unexpectedDialog);
      let id, token;
      try {
        await page.goto(base);
        const trigger = page.locator('.home-hero').getByRole('button', { name: messages.actions.createExchange, exact: true });
        await trigger.click();
        await page.keyboard.press('Escape');
        await expect(page.locator('.modal.show')).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.click();
        await page.locator('#exchangeName').fill('Brouillon');
        page.off('dialog', unexpectedDialog);
        page.once('dialog', dialog => dialog.dismiss());
        await page.keyboard.press('Escape');
        await expect(page.locator('#exchangeName')).toHaveValue('Brouillon');
        await expect(page.locator('.modal.show')).toHaveCount(1);
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: messages.actions.discardChanges, exact: true }).click();
        await expect(page.locator('.modal.show')).toHaveCount(0);
        page.on('dialog', unexpectedDialog);
        await trigger.click();
        await expect(page.locator('#exchangeName')).toHaveValue('');
        await page.locator('#exchangeName').fill(`Création ${locale} ${width}`);
        await page.locator('#organizerName').fill('Alex');
        await page.locator('#adminPassword').fill('creation123');
        const passwordGroup = page.locator('.input-group').filter({ has: page.locator('#adminPassword') });
        await expectFieldGroup(passwordGroup);
        const originalType = await page.locator('#adminPassword').getAttribute('type');
        await passwordGroup.locator('button').click();
        await expect(page.locator('#adminPassword')).toHaveAttribute('type', originalType === 'text' ? 'password' : 'text');
        await expectFieldGroup(passwordGroup);
        await passwordGroup.locator('button').click();
        await page.screenshot({ path: path.join(output, `password-group-${locale}-${width}.png`), fullPage: true });
        if (locale === 'fr-CA' && width === 360) {
          const failCreation = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'API_UNAVAILABLE' } }) });
          await page.route('**/api/exchanges', failCreation);
          await page.locator('button[form=createExchangeForm]').click();
          await expect(page.locator('.modal.show [role=alert]')).toBeVisible();
          await expect(page.locator('#exchangeName')).toHaveValue(`Création ${locale} ${width}`);
          await page.unroute('**/api/exchanges', failCreation);
        }
        const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/exchanges'));
        await page.locator('button[form=createExchangeForm]').click();
        const result = await response;
        assert.equal(result.status(), 201);
        const created = await result.json();
        id = created.exchange.id; token = created.adminSessionToken;
        await expect(page).toHaveURL(`${base}/exchanges/${id}`);
        await expect(page.locator('#detail')).toBeVisible();
        await expect(page.locator('.modal.show, .modal-backdrop')).toHaveCount(0);
        const reminder = page.locator('.access-reminder');
        await expect(reminder).toBeVisible();
        await expectTopSpacing(page, reminder);
        await expectFieldGroup(reminder.locator('.input-group'));
        await expect(reminder.locator('input[readonly]')).toHaveValue(`${base}/exchanges/${id}`);
        await reminder.getByRole('button', { name: messages.actions.copy, exact: true }).click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${base}/exchanges/${id}`);
        await expect(reminder).toBeVisible();
        const violations = (await new AxeBuilder({ page }).options({ preload: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations;
        assert.deepEqual(violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], `${locale}/${width}: accessibility`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale}/${width}: overflow`);
        const reminderBox = await reminder.boundingBox();
        const inputBox = await reminder.locator('input').boundingBox();
        const copyBox = await reminder.getByRole('button', { name: messages.actions.copy, exact: true }).boundingBox();
        assert(reminderBox.height < 400, `${locale}/${width}: compact access reminder`);
        assert(Math.abs(copyBox.height - inputBox.height) < 4, `${locale}/${width}: copy button follows field height`);
        await page.reload();
        await expect(reminder).toBeVisible();
        await expect(reminder.locator('input[readonly]')).toHaveValue(`${base}/exchanges/${id}`);
        await page.screenshot({ path: path.join(output, `organizer-${locale}-${width}.png`), fullPage: true });
        await page.getByRole('button', { name: messages.exchangeDetail.adminAuth.logout, exact: true }).click();
        await page.locator('#exchange-admin-password').fill('creation123');
        await page.getByRole('button', { name: messages.exchangeDetail.adminAuth.login, exact: true }).click();
        await expect(reminder).toBeVisible();
        // Logout revokes the initial token. Use the newly authenticated session for cleanup.
        token = await page.evaluate(id => JSON.parse(localStorage.getItem('kado.adminSessions'))[id], id);
        await reminder.getByRole('button', { name: messages.review.accessSaved, exact: true }).click();
        await page.reload();
        await expect(page.locator('#detail')).toBeVisible();
        await expect(reminder).toHaveCount(0);
        const member = await api('POST', `/api/exchanges/${id}/participants`, { name: 'Blair' }, token, 201);
        const personal = await api('POST', `/api/exchanges/${id}/participants/${member.participant.id}/access/regenerate`, { expectedAccessGenerated: false }, token, 201);
        await page.goto(base + personal.accessLink);
        await expect(page.locator('#participant-name')).toHaveValue('Blair');
        await expect(reminder.getByRole('button', { name: messages.review.participantLinkSaved, exact: true })).toBeVisible();
        await expect(reminder.locator('input')).toHaveCount(0);
        await reminder.getByRole('button', { name: messages.review.participantLinkSaved, exact: true }).click();
        await page.reload();
        await expect(page.locator('#participant-name')).toHaveValue('Blair');
        await expect(reminder).toHaveCount(0);
        assert.deepEqual(errors, [], `${locale}/${width}: browser errors`);
        console.log(`Creation/access ${locale} ${width}: Escape, discard, direct navigation, copy, reload, login and participant confirmation passed.`);
      } finally {
        try { if (id && token) await api('DELETE', `/api/exchanges/${id}`, undefined, token, 204); }
        finally { await context.close(); }
      }
    }
  }
}
