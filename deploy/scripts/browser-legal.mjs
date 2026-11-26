import assert from 'node:assert/strict';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Call only with a disposable copy of the content directory: this verifies live
// edits and missing files, always restoring the original files before returning.
export async function browserLegal({ browser, base, legalDirectory, scratch }) {
  const config = JSON.parse(await readFile(path.join(legalDirectory, 'legal-config.json'), 'utf8'));
  for (const locale of ['fr-CA', 'en-CA', 'es']) {
    const context = await browser.newContext({ locale, ignoreHTTPSErrors: true, reducedMotion: 'reduce' });
    try {
      await context.addInitScript(locale => localStorage.setItem('locale', locale), locale);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 950 });
        for (const document of ['conditions-utilisation', 'confidentialite']) {
          await page.goto(`${base}/${document}`);
          await expect(page.locator('.legal-body')).toHaveAttribute('lang', locale);
          await expect(page.locator('h1')).toHaveText(config.documents[document].titles[locale]);
          await expect(page.locator('footer a[href="/conditions-utilisation"]')).toHaveCount(1);
          await expect(page.locator('footer a[href="/confidentialite"]')).toHaveCount(1);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${document}/${locale}/${width}: overflow`);
          await page.screenshot({ path: path.join(scratch, `legal-${document}-${locale}-${width}.png`), fullPage: true });
          if (locale === 'fr-CA') {
            const audit = await new AxeBuilder({ page }).options({ preload: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
            assert.deepEqual(audit.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
          }
        }
      }
      // Navigation and the language selector must reload the matching document.
      await page.locator('#locale-select').selectOption(locale === 'es' ? 'en-CA' : 'es');
      await expect(page.locator('.legal-body')).toHaveAttribute('lang', locale === 'es' ? 'en-CA' : 'es');
      const termsLink = page.locator('footer a[href="/conditions-utilisation"]');
      await termsLink.focus();
      await expect(termsLink).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(`${base}/conditions-utilisation`);
      await expect(page.locator('.legal-body')).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      // These routes exercise the common footer even on access/error screens.
      for (const route of ['/', '/not-a-page', '/exchanges/not-an-exchange', '/p/invalid']) {
        await page.goto(base + route);
        await expect(page.locator('footer a[href="/conditions-utilisation"]')).toBeVisible();
        await expect(page.locator('footer a[href="/confidentialite"]')).toBeVisible();
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }

  const context = await browser.newContext({ locale: 'fr-CA', ignoreHTTPSErrors: true });
  const file = path.join(legalDirectory, 'confidentiality.md');
  const original = await readFile(file, 'utf8');
  try {
    await context.addInitScript(() => localStorage.setItem('locale', 'fr-CA'));
    const page = await context.newPage();
    // Missing translations display the base document with its actual language.
    const spanish = path.join(legalDirectory, 'confidentiality-es.md');
    await rename(spanish, spanish + '.missing');
    try {
      await page.goto(`${base}/confidentialite`);
      await page.locator('#locale-select').selectOption('es');
      await expect(page.locator('.legal-body')).toHaveAttribute('lang', 'fr-CA');
      await expect(page.locator('.legal-page [role="status"]')).toBeVisible();
    } finally { await rename(spanish + '.missing', spanish); }
    await page.goto(`${base}/confidentialite`);
    await expect(page.locator('.legal-body')).toBeVisible();
    // Atomic file replacement inside the mounted directory is visible immediately.
    await writeFile(file + '.next', original + '\n\nLEGAL LIVE UPDATE CHECK\n');
    await rename(file + '.next', file);
    await page.reload();
    await expect(page.locator('.legal-body')).toContainText('LEGAL LIVE UPDATE CHECK');
    await rename(file, file + '.missing');
    try {
      await page.reload();
      await expect(page.locator('[role="alert"]')).toContainText('Réessayer');
      await expect(page.locator('.legal-body')).toHaveCount(0);
    } finally { await rename(file + '.missing', file); }
    await page.getByRole('button', { name: 'Réessayer le chargement', exact: true }).click();
    await expect(page.locator('.legal-body')).toBeVisible();
    // Install the production service worker, then verify no offline legal cache.
    await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active), { }, { timeout: 15000 });
    await page.reload();
    await expect(page.locator('.legal-body')).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('[role="alert"]')).toContainText('Réessayer');
    await expect(page.locator('.legal-body')).toHaveCount(0);
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Réessayer le chargement', exact: true }).click();
    await expect(page.locator('.legal-body')).toBeVisible();
  } finally {
    await context.close();
    await writeFile(file, original);
  }
  console.log('Legal browser checks passed: three languages, mobile/desktop, accessibility, keyboard, live edits, retry and offline.');
}
