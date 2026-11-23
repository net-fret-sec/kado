import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function browserBudget({ browser, base, api, root, scratch, seedLegacyBudget }) {
  await mkdir(scratch, { recursive: true });
  for (const locale of ['fr-CA', 'en-CA', 'es']) for (const width of [360, 1440]) {
    const t = JSON.parse(await readFile(path.join(root, `apps/web/src/i18n/locales/${locale}.json`), 'utf8'));
    const created = await api('POST', '/api/exchanges', { name: 'Champs facultatifs', organizerParticipates: false, adminPassword: 'password123', description: 'Description', budget: 25, eventDate: '2099-12-25', plannedDrawDate: '2099-12-01' }, undefined, 201);
    const id = created.exchange.id, token = created.adminSessionToken, url = `/api/exchanges/${id}`;
    const legacy = width === 360 ? 25.75 : 1500;
    if (seedLegacyBudget) await seedLegacyBudget(id, legacy);
    const context = await browser.newContext({ locale, viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    try {
      await context.addInitScript(({ id, token, locale }) => {
        localStorage.setItem('locale', locale);
        localStorage.setItem('kado.adminSessions', JSON.stringify({ [id]: token }));
      }, { id, token, locale });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${base}/exchanges/${id}`);
      const edit = () => page.getByRole('button', { name: t.exchangeDetail.dashboard.editSettings, exact: true }).first().click();
      const form = page.locator('#editExchangeForm');
      const save = page.locator('button[form=editExchangeForm]');
      const budget = page.locator('#editExchangeBudget');
      async function saveAndRead() {
        const response = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === url);
        await save.click();
        const r = await response; assert.equal(r.status(), 200);
        await expect(form).not.toBeVisible();
        return { payload: r.request().postDataJSON(), value: await api('GET', url, undefined, token) };
      }
      await edit();
      await expect(budget).toHaveValue(String(seedLegacyBudget ? legacy : 25));
      await page.locator('#editExchangeDescription').fill('Changed');
      const preserved = await saveAndRead();
      assert(!Object.hasOwn(preserved.payload, 'budget'));
      assert.equal(preserved.value.budget, seedLegacyBudget ? legacy : 25);
      await page.reload(); await edit();
      await budget.fill('');
      await page.locator('#editExchangeDescription').fill('');
      await page.locator('#editExchangeEventDate').fill('');
      await page.locator('#editPlannedDrawDate').fill('');
      const cleared = await saveAndRead();
      assert.equal(cleared.payload.budget, null);
      assert.equal(cleared.payload.description, '');
      for (const field of ['budget', 'description', 'eventDate', 'plannedDrawDate']) assert.equal(cleared.value[field], undefined);
      await page.reload(); await edit(); await expect(budget).toHaveValue('');
      await budget.pressSequentially('-');
      await expect(save).toBeDisabled();
      await expect(page.locator('#editExchangeBudget-error')).toHaveText(t.review.budgetInvalid);
      for (const value of ['-1', '25.75', '1001', '100000000']) {
        await budget.fill(value);
        await expect(save).toBeDisabled();
        await expect(page.locator('#editExchangeBudget-error')).toHaveText(t.review.budgetInvalid);
        await expect(budget).toHaveValue(value);
      }
      const audit = await new AxeBuilder({ page }).options({ preload: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(audit.violations.map(v => v.id), []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(scratch, `budget-validation-${locale}-${width}.png`), fullPage: true });
      for (const value of [0, 1, 1000]) {
        await budget.fill(String(value));
        const saved = await saveAndRead(); assert.equal(saved.value.budget, value);
        await page.reload(); await edit(); await expect(budget).toHaveValue(String(value));
      }
      // A concurrent budget change requires an explicit merge before overwriting it.
      await budget.fill('60');
      await api('PUT', url, { budget: 80 }, token);
      await save.click();
      const conflict = page.getByRole('region', { name: t.p2.conflictTitle });
      await expect(conflict).toBeVisible();
      assert.equal((await api('GET', url, undefined, token)).budget, 80);
      await page.locator('input[name=conflict-budget]').first().check();
      await conflict.getByRole('button', { name: t.p2.prepareDraft, exact: true }).click();
      const merged = await saveAndRead(); assert.equal(merged.value.budget, 60);
      // Organizer and participant can both clear a comment without losing the name.
      const member = await api('POST', `${url}/participants`, { name: 'Alex', note: 'Note' }, token, 201);
      await page.reload();
      const row = page.locator('#participants li').filter({ hasText: 'Alex' }); await row.hover();
      await row.getByRole('button', { name: t.actions.edit, exact: true }).click();
      const editor = page.getByRole('dialog', { name: t.exchangeDetail.editModal.title });
      const note = editor.locator('textarea'); await note.fill(''); await note.blur();
      await expect.poll(async () => (await api('GET', `${url}/participants/${member.participant.id}`, undefined, token)).note).toBeUndefined();
      await editor.getByRole('button', { name: t.actions.close, exact: true }).click();
      const personal = await api('POST', `${url}/participants/${member.participant.id}/access/regenerate`, {}, token, 201);
      await page.goto(base + personal.accessLink);
      await page.locator('#participant-note').fill('Again'); await page.locator('#participant-note').blur();
      await expect.poll(async () => (await api('GET', '/api' + personal.accessLink)).participant.note).toBe('Again');
      await page.locator('#participant-note').fill(''); await page.locator('#participant-note').blur();
      await expect.poll(async () => (await api('GET', '/api' + personal.accessLink)).participant.note).toBeUndefined();
      await page.reload(); await expect(page.locator('#participant-note')).toHaveValue('');
      await expect(page.locator('#participant-name')).toHaveValue('Alex');
      assert.deepEqual(errors, []);
      console.log(`Budget/fields: ${locale} ${width}px passed${seedLegacyBudget ? ' including legacy budget' : ''}`);
    } finally {
      await context.close(); await api('DELETE', url, undefined, token, 204);
    }
  }
}
