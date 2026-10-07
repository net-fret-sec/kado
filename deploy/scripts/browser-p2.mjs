import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function browserP2({ browser, base, api, restart, root, scratch }) {
  const fr = JSON.parse(await readFile(path.join(root, 'apps/web/src/i18n/locales/fr-CA.json'), 'utf8'));
  const output = process.env.KADO_E2E_OUTPUT ?? path.join(scratch, 'p2-browser');
  await mkdir(output, { recursive: true });
  async function fixture(name, options = {}) {
    await restart();
    const created = await api('POST', '/api/exchanges', { name, organizerName: 'Hôte P2', organizerParticipates: false, adminPassword: 'p2password123', ...options }, undefined, 201);
    const id = created.exchange.id, token = created.adminSessionToken;
    const members = [];
    for (const member of ['Alex', 'Blair', 'Casey']) members.push(await api('POST', `/api/exchanges/${id}/participants`, { name: member, wishlist: [{ title: 'Livre', icon: 'book', linkUrl: 'https://example.com/book' }, { title: 'Cadeau', icon: 'gift' }], note: 'Note initiale' }, token, 201));
    const context = await browser.newContext({ ignoreHTTPSErrors: true, reducedMotion: 'reduce' });
    await context.addInitScript(({ id, token }) => { try { localStorage.setItem('locale', 'fr-CA'); localStorage.setItem('kado.adminSessions', JSON.stringify({ [id]: token })); } catch { /* Simulated blocked storage starts without persisted sessions. */ } }, { id, token });
    const page = await context.newPage();
    const errors = [], violations = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('p2Violation', value => violations.push(value));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => window.p2Violation({ directive: event.violatedDirective, uri: event.blockedURI, source: event.sourceFile })));
    return { id, token, members, page, context, errors, violations };
  }
  async function audit(page) {
    // Inspect the rendered DOM/styles without axe fetching external Google CSS.
    // Browser stylesheet loading remains enabled; connect-src stays same-origin.
    return new AxeBuilder({ page }).options({ preload: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  }
  async function finish(f) {
    assert.deepEqual(f.errors, [], 'No browser exceptions');
    assert.equal(f.violations.filter(v => (v.directive.startsWith('script-src') || v.directive.startsWith('connect-src'))).length, 0, 'Production CSP preserved: ' + JSON.stringify(f.violations));
    await f.context.close();
  }
  async function self(f, index = 0) {
    await f.page.goto(base + f.members[index].accessLink);
    await expect(f.page.locator('#participant-name')).toHaveValue(f.members[index].participant.name);
  }
  async function admin(f) {
    await f.page.goto(`${base}/exchanges/${f.id}`);
    await expect(f.page.getByRole('button', { name: fr.exchangeDetail.edit, exact: true }).first()).toBeVisible();
  }
  const save = page => page.getByRole('button', { name: fr.participant.save, exact: true });
  const refresh = page => page.getByRole('button', { name: fr.p2.refresh, exact: true });
  console.log('P2 browser: wishlist payload, keyboard, mobile, languages and accessibility');
  {
    const f = await fixture('P2 souhaits'); await self(f);
    await f.page.getByRole('button', { name: fr.p2.moveDown, exact: true }).first().focus();
    await f.page.keyboard.press('Enter');
    await expect(f.page.locator('[role=status]').filter({ hasText: 'position 2' })).toBeVisible();
    const response = f.page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/api/p/'));
    await save(f.page).click(); await response;
    const current = await api('GET', '/api' + f.members[0].accessLink);
    assert.deepEqual(current.participant.wishlist.map(s => [s.title, s.icon]), [['Cadeau', 'gift'], ['Livre', 'book']]);
    await expect(f.page.getByText(fr.participant.saveSuccess, { exact: true })).not.toBeVisible({ timeout: 10000 });
    for (const width of [360, 768, 1440]) {
      await f.page.setViewportSize({ width, height: 900 });
      await f.page.evaluate(() => window.scrollTo(0, 0));
      assert(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}`);
      const results = await audit(f.page);
      assert.deepEqual(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], `Accessibility at ${width}`);
      await f.page.screenshot({ path: path.join(output, `participant-${width}.png`), fullPage: true });
    }
    await f.page.evaluate(() => { document.documentElement.style.zoom = '2' });
    assert(await f.page.evaluate(() => Array.from(document.querySelectorAll('input, textarea, button[type=submit]')).every(element => element.getBoundingClientRect().right <= innerWidth + 1)), 'Form controls remain in viewport at 200% CSS zoom');
    await f.page.screenshot({ path: path.join(output, 'participant-zoom-200.png'), fullPage: false });
    await f.page.evaluate(() => { document.documentElement.style.zoom = '' });
    await f.page.keyboard.press('Control+Home');
    await f.page.locator('.skip-link').focus(); await f.page.keyboard.press('Enter');
    await expect(f.page.locator('#main-content')).toBeFocused();
    await f.page.locator('#locale-select').selectOption('en-CA');
    await expect(f.page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible();
    await expect(f.page.getByRole('button', { name: 'Move up', exact: true }).first()).toBeVisible();
    await finish(f);
  }
  console.log('P2 browser: conflicts, independent merge, repeated conflict, draft guard');
  {
    const f = await fixture('P2 conflits'); await self(f);
    await f.page.locator('#participant-note').fill('Brouillon local');
    const p = f.members[0].participant;
    await api('PUT', `/api/exchanges/${f.id}/participants/${p.id}`, { name: 'Alex serveur' }, f.token);
    await save(f.page).click();
    await expect(f.page.getByRole('region', { name: fr.p2.conflictTitle })).toBeVisible();
    await f.page.getByRole('button', { name: fr.p2.prepareDraft }).click();
    await expect(f.page.locator('#participant-name')).toHaveValue('Alex serveur');
    await expect(f.page.locator('#participant-note')).toHaveValue('Brouillon local');
    await api('PUT', `/api/exchanges/${f.id}/participants/${p.id}`, { note: 'Note serveur' }, f.token);
    await save(f.page).click();
    await expect(f.page.getByRole('region', { name: fr.p2.conflictTitle })).toBeVisible();
    await f.page.getByRole('radio').first().check();
    await f.page.getByRole('button', { name: fr.p2.prepareDraft }).click();
    await save(f.page).click();
    await expect(f.page.getByText(fr.participant.saveSuccess, { exact: true })).toBeVisible();
    assert.equal((await api('GET', '/api' + f.members[0].accessLink)).participant.note, 'Brouillon local');
    await f.page.locator('#participant-note').fill('À garder');
    f.page.once('dialog', dialog => dialog.dismiss());
    await f.page.locator('.navbar-brand').click();
    await expect(f.page.locator('#participant-note')).toHaveValue('À garder');
    f.page.once('dialog', dialog => dialog.accept());
    await f.page.locator('.navbar-brand').click();
    await expect(f.page).toHaveURL(base + '/');
    await finish(f);
  }
  console.log('P2 browser: recoverable error, double submission and uncertain write');
  {
    const f = await fixture('P2 erreurs'); await self(f);
    let requests = 0;
    await f.page.route('**/api/p/**', async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      requests++; await new Promise(resolve => setTimeout(resolve, 200));
      await route.fulfill({ status: 503, contentType: 'application/json', headers: { 'Retry-After': '10' }, body: JSON.stringify({ error: { code: 'SERVICE_BUSY' } }) });
    });
    await f.page.locator('#participant-note').fill('Encore présent');
    await save(f.page).evaluate(button => { button.click(); button.click() });
    await expect(f.page.locator('[role=alert]').filter({ hasText: /occup|busy|indisponible/i }).first()).toBeVisible();
    assert.equal(requests, 1); await expect(f.page.locator('#participant-note')).toHaveValue('Encore présent');
    await f.page.unroute('**/api/p/**');
    await f.page.route('**/api/p/**', route => route.request().method() === 'PUT' ? route.abort('failed') : route.continue());
    await save(f.page).click();
    await expect(f.page.getByText(fr.p2.outcomeUncertain)).toBeVisible();
    await expect(f.page.locator('#participant-note')).toHaveValue('Encore présent');
    await finish(f);
  }
  console.log('P2 browser: draw locks, revoked links and refreshed recipient');
  {
    const f = await fixture('P2 permissions'); await self(f);
    await api('POST', `/api/exchanges/${f.id}/draw`, undefined, f.token);
    await refresh(f.page).click();
    await expect(save(f.page)).toHaveCount(0);
    await expect(f.page.locator('#participant-self-view input[type=url]')).toHaveCount(0);
    await expect(f.page.getByText(fr.participant.recipientSectionTitle, { exact: true })).toBeVisible();
    await api('POST', `/api/exchanges/${f.id}/participants/${f.members[0].participant.id}/access/regenerate`, { revokeExisting: true }, f.token, 201);
    await refresh(f.page).click();
    await expect(f.page.locator('#participant-name')).toHaveCount(0);
    await expect(f.page.getByText(fr.participant.recipientSectionTitle, { exact: true })).toHaveCount(0);
    await finish(f);
  }
  console.log('P2 browser: admin add link, rotation cancellation, config recovery, focus');
  {
    const f = await fixture('P2 administration');
    await f.page.route('**/api/config', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_BUSY' } }) }));
    await admin(f);
    await expect(f.page.locator('[ref=newParticipantNameInput]')).toHaveCount(0);
    await expect(f.page.getByRole('button', { name: fr.p2.retryConfig })).toBeVisible();
    await expect(f.page.getByRole('button', { name: new RegExp(fr.exchangeDetail.addParticipant) })).toHaveCount(0);
    await f.page.unroute('**/api/config'); await f.page.getByRole('button', { name: fr.p2.retryConfig }).click();
    const add = f.page.getByRole('button', { name: new RegExp(fr.exchangeDetail.addParticipant) });
    await expect(add).toBeVisible();
    await f.page.getByRole('textbox', { name: fr.exchangeDetail.addModal.name, exact: true }).fill('Dana');
    const addedResponse = f.page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/participants'));
    await add.click(); const added = await (await addedResponse).json();
    const dialog = f.page.getByRole('dialog', { name: fr.exchangeDetail.linkModal.title });
    await expect(dialog).toBeVisible(); await expect(dialog.getByRole('textbox')).toHaveValue(base + added.accessLink);
    await dialog.getByRole('button', { name: fr.exchangeDetail.linkModal.close }).click();
    await expect(dialog).not.toBeVisible();
    f.page.once('dialog', dialog => dialog.dismiss());
    await f.page.getByRole('button', { name: fr.exchangeDetail.generateLink, exact: true }).first().click();
    assert.equal((await api('GET', '/api' + f.members[0].accessLink)).participant.name, 'Alex');
    const editButton = f.page.getByRole('button', { name: fr.exchangeDetail.edit, exact: true }).first();
    await editButton.click();
    const editor = f.page.getByRole('dialog', { name: fr.exchangeDetail.editExchangeModal.title });
    await expect(editor).toBeVisible(); await expect(f.page.locator('#editOrganizerName')).toBeFocused();
    await editor.getByRole('button').last().focus();
    await f.page.keyboard.press('Tab');
    assert(await editor.evaluate(element => element.contains(document.activeElement)), 'Focus remains in modal after Tab');
    await f.page.keyboard.press('Shift+Tab');
    assert(await editor.evaluate(element => element.contains(document.activeElement)), 'Focus remains in modal after Shift+Tab');
    const results = await audit(f.page);
    assert.deepEqual(results.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], 'Admin dialog accessibility');
    await f.page.keyboard.press('Escape'); await expect(editor).not.toBeVisible(); await expect(editButton).toBeFocused();
    await editButton.click(); await f.page.locator('#editExchangeName').fill('Brouillon conservé');
    f.page.once('dialog', dialog => dialog.dismiss()); await f.page.keyboard.press('Escape');
    await expect(editor).toBeVisible(); await expect(f.page.locator('#editExchangeName')).toHaveValue('Brouillon conservé');
    f.page.once('dialog', dialog => dialog.accept()); await f.page.keyboard.press('Escape'); await expect(editor).not.toBeVisible();
    await expect(f.page.locator('body')).not.toHaveClass(/modal-open/);
    await f.page.setViewportSize({ width: 360, height: 900 });
    await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await f.page.screenshot({ path: path.join(output, 'admin-360.png'), fullPage: true });
    assert(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Admin mobile overflow');
    await finish(f);
  }
  console.log('P2 browser: admin session expiry, reauthentication with draft and logout failure');
  {
    const f = await fixture('P2 sessions'); await admin(f);
    await f.page.getByRole('button', { name: fr.exchangeDetail.edit, exact: true }).first().click();
    await f.page.locator('#editExchangeName').fill('Brouillon réauth');
    await api('DELETE', `/api/exchanges/${f.id}/admin/sessions/current`, undefined, f.token, 204);
    await f.page.locator('button[form=editExchangeForm]').click();
    await expect(f.page.locator('#exchange-admin-password')).toBeVisible();
    await expect(f.page.getByRole('dialog', { name: fr.exchangeDetail.editExchangeModal.title })).not.toBeVisible();
    await f.page.locator('#exchange-admin-password').fill('p2password123');
    await f.page.getByRole('button', { name: fr.exchangeDetail.adminAuth.login, exact: true }).click();
    await expect(f.page.locator('#editExchangeName')).toHaveValue('Brouillon réauth');
    await expect(f.page.getByRole('region', { name: fr.p2.conflictTitle })).toBeVisible();
    await f.page.getByRole('button', { name: fr.p2.prepareDraft }).click();
    await f.page.locator('button[form=editExchangeForm]').click();
    await expect(f.page.getByRole('dialog', { name: fr.exchangeDetail.editExchangeModal.title })).not.toBeVisible();
    await expect(f.page.getByRole('heading', { name: 'Brouillon réauth', exact: true })).toBeVisible();
    await f.page.route('**/admin/sessions/current', route => route.abort('failed'));
    await f.page.getByRole('button', { name: fr.exchangeDetail.adminAuth.logout, exact: true }).click();
    await expect(f.page.getByText(fr.p2.logoutUnconfirmed, { exact: true })).toBeVisible();
    await expect(f.page.locator('#exchange-admin-password')).toBeVisible();
    await finish(f);
  }
  console.log('P2 browser: storage unavailable and unknown route');
  {
    const f = await fixture('P2 stockage');
    await f.context.addInitScript(() => { Storage.prototype.getItem = () => { throw new DOMException('blocked', 'SecurityError') }; Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError') }; });
    await f.page.goto(base + '/unknown-p2');
    await expect(f.page.getByRole('heading', { name: fr.p2.notFoundTitle })).toBeVisible();
    await expect(f.page.getByText(fr.p2.storageUnavailable)).toBeVisible();
    await f.page.getByRole('link', { name: fr.p2.home }).click();
    await expect(f.page.getByRole('button', { name: fr.home.hero.primaryAction }).first()).toBeVisible();
    await finish(f);
  }
  console.log('P2 browser scenarios passed; screenshots: ' + output);
}
