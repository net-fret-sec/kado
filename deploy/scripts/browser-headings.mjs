import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function browserHeadings({ browser, base, localBase, api, root, scratch }) {
  const output = path.join(scratch, 'headings'); await mkdir(output, { recursive: true });
  for (const locale of ['fr-CA', 'en-CA', 'es']) for (const width of [360, 768, 1440]) {
    const t = JSON.parse(await readFile(path.join(root, `apps/web/src/i18n/locales/${locale}.json`), 'utf8'));
    const created = await api('POST', '/api/exchanges', { name: 'Un échange avec un nom assez long pour vérifier les titres', adminPassword: 'password123', organizerName: 'Alex' }, undefined, 201);
    const id = created.exchange.id, token = created.adminSessionToken;
    const context = await browser.newContext({ locale, viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    try {
      await context.addInitScript(({ locale }) => localStorage.setItem('locale', locale), { locale });
      const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
      async function mainTitle() { await expect(page.locator('h1')).toHaveCount(1); await expect(page.locator('.app-topbar h1')).toHaveCount(0); }
      async function audit(label) {
        const result = await new AxeBuilder({ page }).options({ preload: false }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        assert.deepEqual(result.violations.map(v => v.id), [], label);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label);
      }
      await page.goto(base); await mainTitle(); await expect(page.locator('.home-hero h1')).toBeVisible(); await audit('Home headings');
      await page.goto(`${base}/missing-headings-route`); await mainTitle();
      await page.evaluate(({id,token}) => localStorage.setItem('kado.adminSessions',JSON.stringify({[id]:token})),{id,token});
      await page.route(`**/api/exchanges/${id}`, route => route.fulfill({status:503,json:{error:{code:'SERVICE_BUSY'}}}));
      await page.goto(`${base}/exchanges/${id}`);
      await expect(page.locator('main').getByRole('alert')).toBeVisible(); await mainTitle();
      await page.unroute(`**/api/exchanges/${id}`);
      await page.evaluate(()=>localStorage.removeItem('kado.adminSessions'));
      await page.goto(`${base}/exchanges/${id}`); await expect(page.locator('#exchange-admin-password')).toBeVisible(); await mainTitle(); await audit('Login heading');
      await page.evaluate(({id, token}) => localStorage.setItem('kado.adminSessions', JSON.stringify({[id]: token})), {id,token});
      await page.reload(); await expect(page.locator('#detail h1')).toBeVisible(); await mainTitle();
      const settings = page.locator('#exchange-details h2'), participants = page.locator('#participants h2');
      assert.equal(await settings.evaluate(e => getComputedStyle(e).fontSize), await participants.evaluate(e => getComputedStyle(e).fontSize));
      await page.screenshot({ path: path.join(output, `organizer-${locale}-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: t.exchangeDetail.dashboard.editSettings, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: t.exchangeDetail.editExchangeModal.title });
      await expect(dialog.locator('h2.modal-title')).toHaveClass(/h4/);
      for (const [a,b] of [['#editPlannedDrawDate','#editExchangeEventDate'],['#editExchangeBudget','#editExchangeMinSuggestions']]) {
        const first = await page.locator(a).boundingBox(), second = await page.locator(b).boundingBox();
        assert(Math.abs(first.width-second.width)<1, 'Equal field widths');
        if (width>=992) assert(Math.abs(first.y-second.y)<1 && second.x>first.x, 'Paired fields');
        else assert(second.y>=first.y+first.height && Math.abs(first.x-second.x)<1, 'Stacked fields');
        await page.locator(a).focus(); await page.locator(a).press('Tab');
        if (a === '#editExchangeBudget') await expect(page.locator(b)).toBeFocused();
        // Native date inputs can have multiple internal keyboard segments. DOM order is checked separately.
        await expect(page.locator(a)).toHaveAccessibleName(new RegExp(a.includes('Planned') ? t.fields.plannedDrawDate : t.fields.budget));
      }
      const order = await page.locator('#editExchangeForm input').evaluateAll(inputs => inputs.map(e=>e.id));
      const paired = ['editPlannedDrawDate','editExchangeEventDate','editExchangeBudget','editExchangeMinSuggestions'];
      assert.deepEqual(order.filter(id=>paired.includes(id)),paired);
      await expect(page.locator('#editExchangeEventDate')).toHaveAttribute('aria-describedby', /dates-help/);
      await page.locator('#editExchangeBudget').fill('1001'); await page.locator('#editExchangeBudget').press('Tab');
      await expect(page.locator('#editExchangeBudget-error')).toBeVisible(); await audit('Edit form with error');
      await page.screenshot({ path: path.join(output, `form-${locale}-${width}.png`), fullPage: true });
      await page.locator('#editExchangeBudget').fill('');
      await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
      const member = await api('POST', `/api/exchanges/${id}/participants`, {name:'Blair'}, token, 201);
      const personal = await api('POST', `/api/exchanges/${id}/participants/${member.participant.id}/access/regenerate`, {}, token, 201);
      await page.goto(base+personal.accessLink); await mainTitle();
      const sizes = await page.locator('#participant-self-view h2').evaluateAll(nodes => nodes.map(e=>getComputedStyle(e).fontSize));
      assert.equal(new Set(sizes).size,1, 'Uniform participant section titles');
      await audit('Participant headings');
      await page.screenshot({ path: path.join(output, `participant-${locale}-${width}.png`), fullPage: true });
      // The local-only list is exercised on Vite dev; its list response is isolated from production visibility policy.
      await page.route('**/api/exchanges', route => route.request().method()==='GET' ? route.fulfill({json:[created.exchange]}) : route.continue());
      await page.goto(`${localBase}/exchanges`); await expect(page.locator('#exchanges-view')).toBeVisible(); await mainTitle();
      await expect(page.locator('#exchanges-view .card-title')).toHaveCount(1);
      await expect(page.locator('#exchanges-view h2.card-title')).toHaveText(created.exchange.name);
      const localAudit = await new AxeBuilder({ page }).options({ preload: false }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      const violations = localAudit.violations.map(v=>({ id:v.id, nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})) }));
      await writeFile(path.join(output, `local-list-axe-${locale}-${width}.json`), JSON.stringify(violations,null,2));
      if (locale==='fr-CA' && width===360) console.log('Local list axe findings:', JSON.stringify(violations));
      assert(violations.every(v => v.nodes.every(n =>
        (v.id === 'aria-prohibited-attr' && n.target.length === 1 && n.target[0] === '.panel-entry-btn') ||
        (v.id === 'color-contrast' && n.target.every(selector => selector.includes('.palette-swatch')))
      )), 'Only documented dev-panel/palette findings; no violation on the exchange list');
      assert.deepEqual(errors,[]);
      console.log(`Headings/form ${locale} ${width}px: routes, local list, modal, responsive pairs and public axe passed; local dev findings recorded`);
    } finally { await context.close(); }
  }
}
