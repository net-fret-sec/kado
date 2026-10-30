// Real API/browser acceptance test. Uses only a newly created disposable database.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readdir, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { browserP2 } from './browser-p2.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));
const { Pool } = apiRequire('pg');
const output = process.env.KADO_E2E_OUTPUT ?? '/tmp/kado-review-e2e';
const database = `kado_test_${randomUUID().replaceAll('-', '')}`;
const container = `kado-review-${randomUUID().slice(0, 8)}`;
const password = randomUUID();
let started = false, pool, apiServer, webServer, browser;
function docker(args) {
  const r = spawnSync('docker', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.error?.message);
  return r.stdout.trim();
}
async function port() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}
async function until(fn, ms = 30000) {
  const deadline = Date.now() + ms;
  while (true) {
    try { return await fn(); } catch (e) {
      if (Date.now() > deadline) throw e;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const closed = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  await closed;
  clearTimeout(timer);
}
try {
  await mkdir(output, { recursive: true });
  docker(['run', '-d', '--name', container, '-e', `POSTGRES_DB=${database}`, '-e', 'POSTGRES_USER=kado_test', '-e', `POSTGRES_PASSWORD=${password}`, '-p', '127.0.0.1::5432', 'postgres:16-alpine']);
  started = true;
  const dbPort = docker(['inspect', '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', container]);
  const databaseUrl = `postgresql://kado_test:${password}@127.0.0.1:${dbPort}/${database}`;
  pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1000 });
  await until(() => pool.query('SELECT 1'));
  for (const file of (await readdir(path.join(root, 'apps/api/migrations'))).filter(f => f.endsWith('.sql')).sort())
    await pool.query(await readFile(path.join(root, 'apps/api/migrations', file), 'utf8'));
  const apiPort = await port(), webPort = await port();
  const base = `http://127.0.0.1:${webPort}`, apiBase = `http://127.0.0.1:${apiPort}`;
  const apiEnv = { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, SERVER_PORT: String(apiPort), FRONTEND_BASE_URL: base, FRONTEND_ALLOWED_ORIGINS: base, API_RATE_LIMIT: '100000', CREATE_RATE_LIMIT: '100000', AUTH_RATE_LIMIT: '100000', AUTH_PAIR_RATE_LIMIT: '100000', PARTICIPANT_RATE_LIMIT: '100000', DRAW_RATE_LIMIT: '100000' };
  const startApi = () => spawn(process.execPath, ['apps/api/dist/server.cjs'], { cwd: root, env: apiEnv, stdio: 'ignore' });
  apiServer = startApi();
  const webEnv = { ...process.env, VITE_API_BASE: apiBase, VITE_DONATION_URL: 'https://example.com/support', VITE_CURRENCY_SYMBOL: '€' };
  const site = path.join(output, 'site');
  const build = spawnSync('pnpm', ['--dir', 'apps/web', 'exec', 'vite', 'build', '--outDir', site], { cwd: root, env: webEnv, encoding: 'utf8' });
  if (build.status !== 0) throw new Error(build.stderr || build.stdout);
  webServer = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort', '--outDir', site], { cwd: path.join(root, 'apps/web'), env: webEnv, stdio: 'ignore' });
  await until(async () => { assert.equal((await fetch(apiBase + '/health')).status, 200); assert.equal((await fetch(base)).status, 200); });
  async function api(method, url, body, token, status = 200) {
    const r = await fetch(apiBase + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(r.status, status, `${method} ${url}: ${await r.clone().text()}`);
    return r.status === 204 ? undefined : r.json();
  }
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => localStorage.setItem('locale', 'fr-CA'));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', dialog => dialog.accept());
  async function audit(label) {
    const result = await new AxeBuilder({ page }).options({ preload: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], label);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: no horizontal overflow`);
  }
  await page.goto(base);
  await expect(page.locator('footer .home-support')).toHaveCount(1);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: path.join(output, 'review-home.png'), fullPage: true });
  await page.getByRole('button', { name: 'Créer un échange', exact: true }).click();
  await expect(page.locator('#adminPassword')).toHaveAttribute('type', 'text');
  await expect(page.locator('#organizerParticipates')).toHaveCount(0);
  await page.locator('#exchangeName').fill('Revue Kado');
  await page.locator('#organizerName').fill('Alex');
  await page.locator('#adminPassword').fill('abcdefg');
  await expect(page.locator('button[form=createExchangeForm]')).toBeDisabled();
  await page.locator('#adminPassword').fill('abcdefgh');
  await page.getByRole('button', { name: 'Masquer', exact: true }).click();
  await expect(page.locator('#adminPassword')).toHaveAttribute('type', 'password');
  await audit('Creation form');
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: path.join(output, 'review-creation.png'), fullPage: true });
  const creation = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/exchanges'));
  await page.locator('button[form=createExchangeForm]').click();
  const created = await (await creation).json(), id = created.exchange.id, token = created.adminSessionToken;
  await page.getByRole('button', { name: /Continuer vers/ }).click();
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('.access-reminder')).toBeVisible();
  await page.getByRole('button', { name: 'J’ai conservé mes accès' }).click();
  await page.reload();
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('.access-reminder')).toHaveCount(0);
  const members = [{ participant: created.exchange.organizerId, name: 'Alex' }];
  for (const name of ['Casey', 'Blair']) {
    await page.locator('#new-participant-name').fill(name);
    const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/participants'));
    await page.locator('#participants button[type=submit]').click();
    const member = await (await response).json(); members.push({ participant: member.participant.id, name });
    await expect(page.getByRole('dialog', { name: 'Lien du participant' })).toContainText(name);
    await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  }
  assert.deepEqual(await page.locator('#participants li strong').allTextContents(), ['Alex', 'Blair', 'Casey']);
  await page.getByRole('button', { name: 'Modifier les détails', exact: true }).click();
  await expect(page.locator('button[form=editExchangeForm]')).toBeDisabled();
  await page.locator('#editPlannedDrawDate').fill('2099-12-01');
  await page.locator('#editExchangeEventDate').fill('2099-12-25');
  await page.locator('#editExchangeBudget').fill('35');
  await page.locator('button[form=editExchangeForm]').click();
  await expect(page.locator('#exchange-details')).toContainText('35 €');
  await expect(page.locator('#detail')).not.toContainText('35 €');
  await page.getByRole('button', { name: 'Modifier les détails', exact: true }).click();
  await page.locator('#editPlannedDrawDate').fill('');
  await page.locator('button[form=editExchangeForm]').click();
  await expect(page.getByRole('dialog', { name: 'Modifier l’échange', exact: true })).toBeHidden();
  const fresh = await api('GET', `/api/exchanges/${id}`, undefined, token);
  assert.equal(fresh.plannedDrawDate, undefined); assert.equal(fresh.eventDate, '2099-12-25');
  await page.locator('#participants li').first().hover();
  await page.locator('#participants').getByRole('button', { name: 'Modifier', exact: true }).first().click();
  await page.locator('#exclusion-receiver').selectOption(members.find(m => m.name === 'Blair').participant);
  await page.getByRole('dialog', { name: 'Modifier le participant' }).getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Modifier le participant' })).toContainText('Blair');
  await expect(page.getByRole('dialog').locator('.text-success[role=status]')).toContainText('Exclusion');
  await expect(page.locator('button[form=editParticipantForm]')).toBeDisabled();
  await page.getByRole('dialog', { name: 'Modifier le participant' }).getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(page.locator('#exchange-details')).toContainText('Alex ne peut pas piger Blair.');
  const detailBox = await page.locator('#exchange-details').boundingBox(), participantBox = await page.locator('#participants').boundingBox();
  assert(detailBox.x < participantBox.x);
  await audit('Organizer');
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: path.join(output, 'review-organizer.png'), fullPage: true });
  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(`${base}/exchanges/${id}`);
  await expect(touchPage.locator('#participants li')).toHaveCount(3);
  assert(await touchPage.evaluate(() => matchMedia('(hover: none)').matches));
  const touchActions = touchPage.locator('.participant-actions').first();
  assert.equal(await touchActions.evaluate(el => getComputedStyle(el).opacity), '1', 'Touch actions are always shown');
  await touchActions.getByRole('button', { name: 'Modifier', exact: true }).tap();
  await expect(touchPage.getByRole('dialog', { name: 'Modifier le participant' })).toBeVisible();
  await touchPage.getByRole('dialog').getByRole('button', { name: 'Fermer', exact: true }).tap();
  assert(await touchPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No overflow on touch screens');
  await expect(touchPage.getByRole('dialog', { name: 'Modifier le participant' })).toBeHidden();
  assert.equal(await touchActions.evaluate(el => getComputedStyle(el).opacity), '1', 'Touch actions remain visible after closing');
  // Keep touch emulation intact through the audit: full-page capture changes pointer emulation in this runner.
  const touchAudit = await new AxeBuilder({ page: touchPage }).options({ preload: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(touchAudit.violations.map(v => v.id), [], 'Touch organizer accessibility');
  await touchContext.close();
  const personal = await api('POST', `/api/exchanges/${id}/participants/${members[0].participant}/access/regenerate`, { revokeExisting: true }, token, 201);
  await page.goto(base + personal.accessLink);
  await expect(page.getByRole('heading', { name: 'Participants à l’échange' })).toBeVisible();
  await expect(page.locator('.participant-details-column')).toContainText('Alex ne peut pas piger Blair.');
  const left = await page.locator('.participant-details-column').boundingBox(), profile = await page.locator('.participant-profile-card').boundingBox(), wishes = await page.locator('.participant-suggestions-card').boundingBox();
  assert(left.x < profile.x && profile.y < wishes.y, 'Shared details on left, profile above suggestions on right');
  await expect(page.getByRole('button', { name: 'Enregistrer les modifications', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Ajouter une suggestion', exact: true }).click();
  await page.locator('input[id$="-title"]').first().fill('Un livre');
  await page.locator('input[type=url]').first().fill('https://example.com/book');
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWP4z8CAFWEXHbQSACj/P8FTKqelAAAAAElFTkSuQmCC';
  const transfer = await page.evaluateHandle(value => { const d = new DataTransfer(); d.items.add(new File([Uint8Array.from(atob(value), c => c.charCodeAt(0))], 'gift.png', { type: 'image/png' })); return d; }, png);
  await page.locator('.suggestion-image-button').first().dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter une suggestion', exact: true }).click();
  await page.locator('input[id$="-title"]').nth(1).fill('Du chocolat');
  await page.locator('.drag-handle').first().focus(); await page.keyboard.press('ArrowDown');
  await expect(page.locator('input[id$="-title"]').first()).toHaveValue('Du chocolat');
  await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enregistrer les modifications', exact: true })).toBeDisabled();
  const saved = await api('GET', '/api' + personal.accessLink);
  assert.equal(saved.participant.wishlist[1].title, 'Un livre'); assert(saved.participant.wishlist[1].imageId);
  await audit('Participant desktop');
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: path.join(output, 'review-participant.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 900 });
  await audit('Participant mobile');
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: path.join(output, 'review-participant-mobile.png'), fullPage: true });
  await page.locator('#participant-note').fill('Brouillon conservé');
  await ctx.setOffline(true);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('button', { name: 'Actualiser', exact: true })).toBeVisible();
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('button', { name: 'Actualiser', exact: true })).toHaveCount(0);
  await expect(page.locator('#participant-note')).toHaveValue('Brouillon conservé');
  await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enregistrer les modifications', exact: true })).toBeDisabled();
  await api('POST', `/api/exchanges/${id}/draw`, undefined, token);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { name: 'Personne pigée', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Participants à l’échange' })).toHaveCount(0);
  await expect(page.locator('input[type=url]')).toHaveCount(0);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: path.join(output, 'review-after-draw.png'), fullPage: true });
  await api('POST', `/api/exchanges/${id}/draw/cancel`, undefined, token);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { name: 'Participants à l’échange' })).toBeVisible();
  await page.goto(`${base}/exchanges/${id}`);
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await page.locator('#exchange-admin-password').fill('ABCDEFGH');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.locator('#detail')).toBeVisible();
  await page.getByRole('button', { name: 'Supprimer l’échange', exact: true }).click();
  await page.locator('#delete-exchange-name').fill('revue kado');
  await expect(page.locator('button[form=delete-exchange-form]')).toBeDisabled();
  await page.locator('#delete-exchange-name').fill('Revue Kado');
  await page.locator('button[form=delete-exchange-form]').click();
  await expect(page.locator('#home-view')).toBeVisible();
  await api('GET', '/api' + personal.accessLink, undefined, undefined, 404);
  await page.goto(base + '/not-a-route');
  await expect(page.locator('footer')).toBeVisible();
  const footer = await page.locator('footer').boundingBox();
  assert(Math.abs(footer.y + footer.height - page.viewportSize().height) < 2, 'Footer reaches viewport bottom on short page');
  assert.equal(await page.locator('.home-support').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.deepEqual(errors, []);
  await ctx.close();
  console.log('UI review: full real-server lifecycle, dates, currency, exclusions, drop upload, keyboard order, names privacy, reconnect, case-insensitive password and deletion passed; desktop/mobile axe: 0 violations.');
  if (process.env.KADO_REVIEW_SKIP_P2 !== '1') await browserP2({ browser, base, api, root, scratch: output, restart: async () => { await stop(apiServer); apiServer = startApi(); await until(() => api('GET', '/health')); } });
  const ux = spawnSync(process.execPath, ['deploy/scripts/browser-ux.mjs'], { cwd: root, env: { ...process.env, KADO_UX_BASE: base, KADO_UX_OUTPUT: path.join(output, 'large-group') }, encoding: 'utf8' });
  if (ux.status !== 0) throw new Error(ux.stderr || ux.stdout);
  console.log(ux.stdout.trim());
} finally {
  await browser?.close();
  await stop(webServer); await stop(apiServer);
  if (pool) await pool.end();
  if (started) docker(['rm', '-f', container]);
}
