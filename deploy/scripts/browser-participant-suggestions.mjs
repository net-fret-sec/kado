import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function browserParticipantSuggestions({ browser, base, api, root, scratch }) {
  await mkdir(scratch, { recursive: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWP4z8CAFWEXHbQSACj/P8FTKqelAAAAAElFTkSuQmCC', 'base64');
  for (const locale of ['fr-CA', 'en-CA', 'es']) for (const width of [360, 1440]) {
    const t = JSON.parse(await readFile(path.join(root, `apps/web/src/i18n/locales/${locale}.json`), 'utf8'));
    const created = await api('POST', '/api/exchanges', { name: 'Participants et suggestions', organizerParticipates: false, adminPassword: 'testpassword123' }, undefined, 201);
    const id = created.exchange.id, token = created.adminSessionToken;
    const context = await browser.newContext({ locale, viewport: { width, height: 1000 }, reducedMotion: 'reduce', hasTouch: width === 360 });
    try {
      const members = [];
      for (const name of ['Zoé', 'Alex', 'Alex']) members.push((await api('POST', `/api/exchanges/${id}/participants`, { name, wishlist: [{ title: 'Livre', linkUrl: 'https://example.com/book' }] }, token, 201)).participant);
      const link = await api('POST', `/api/exchanges/${id}/participants/${members[0].id}/access/regenerate`, {}, token, 201);
      await context.addInitScript(locale => localStorage.setItem('locale', locale), locale);
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + link.accessLink);
      const list = page.locator('.participant-list');
      await expect(list.locator('li')).toHaveCount(3);
      assert.deepEqual(await list.locator('li > span:first-child').allTextContents(), ['Alex', 'Alex', 'Zoé']);
      await expect(list.locator('strong')).toHaveCount(0);
      await expect(list.locator('.badge')).toHaveText(['1', '1', '1']);
      const item = page.locator('.suggestion-item').first();
      await item.locator('input[type=file]').setInputFiles({ name: 'gift.png', mimeType: 'image/png', buffer: png });
      await expect(item.locator('img')).toBeVisible();
      await expect.poll(async () => (await api('GET', '/api' + link.accessLink)).participant.wishlist[0].imageId).toBeTruthy();
      await page.reload(); await item.scrollIntoViewIfNeeded(); await expect(item.locator('img')).toBeVisible();
      const remove = item.getByRole('button', { name: t.images.remove, exact: true });
      const imageBox = await item.locator('.suggestion-image-button').boundingBox();
      const removeBox = await remove.boundingBox();
      assert(Math.abs(removeBox.width - removeBox.height) < 1, `Remove button should be round: ${JSON.stringify(removeBox)}`);
      assert(removeBox.x >= imageBox.x && removeBox.y >= imageBox.y && removeBox.x + removeBox.width <= imageBox.x + imageBox.width && removeBox.y + removeBox.height <= imageBox.y + imageBox.height);
      let fileChooserOpened = false;
      page.on('filechooser', () => { fileChooserOpened = true; });
      if (width === 360) await remove.tap();
      else { await remove.focus(); await page.keyboard.press('Enter'); }
      await expect(item.locator('img')).toHaveCount(0);
      await expect(item.locator('.suggestion-image-button')).toBeFocused();
      await expect.poll(async () => (await api('GET', '/api' + link.accessLink)).participant.wishlist[0]).toEqual({ title: 'Livre', linkUrl: 'https://example.com/book' });
      await page.reload();
      await expect(item.locator('img')).toHaveCount(0);
      await expect(item.locator('input[id$="-title"]')).toHaveValue('Livre');
      await expect(item.locator('input[type=url]')).toHaveValue('https://example.com/book');
      assert.equal(fileChooserOpened, false);
      // A replacement is still possible after removal; its button vanishes in read-only mode.
      await item.locator('input[type=file]').setInputFiles({ name: 'gift.png', mimeType: 'image/png', buffer: png });
      await expect.poll(async () => (await api('GET', '/api' + link.accessLink)).participant.wishlist[0].imageId).toBeTruthy();
      await api('PUT', `/api/exchanges/${id}/participants/${members[1].id}`, { wishlist: [] }, token);
      await page.reload(); await expect(list.locator('.badge')).toHaveText(['0', '1', '1']);
      await api('POST', `/api/exchanges/${id}/draw`, undefined, token);
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      const drawn = await api('GET', '/api' + link.accessLink);
      await expect(list.locator('strong')).toHaveCount(1);
      await expect(list.locator(`[data-participant-id="${drawn.assignment.receiverId}"] strong`)).toHaveText('Alex');
      await expect(page.locator('.suggestion-remove-image')).toHaveCount(0);
      await expect(list.locator('.badge')).toHaveText(['0', '1', '1']);
      const audit = await new AxeBuilder({ page }).options({ preload: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(audit.violations.map(v => v.id), []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await page.screenshot({ path: path.join(scratch, `participant-suggestions-${locale}-${width}.png`), fullPage: true });
      await api('POST', `/api/exchanges/${id}/draw/cancel`, undefined, token);
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await expect(list.locator('strong')).toHaveCount(0);
      await expect(list.locator('li')).toHaveCount(3);
      await expect(page.locator('.suggestion-remove-image')).toBeVisible();
      await item.scrollIntoViewIfNeeded();
      await expect(item.locator('img')).toBeVisible();
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await page.screenshot({ path: path.join(scratch, `image-removal-${locale}-${width}.png`), fullPage: true });
      const editAudit = await new AxeBuilder({ page }).options({ preload: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(editAudit.violations.map(v => v.id), []);
      assert.deepEqual(errors, []);
      console.log(`Participant suggestions: ${locale} ${width}px passed`);
    } finally {
      await context.close();
      await api('DELETE', `/api/exchanges/${id}`, undefined, token, 204);
    }
  }
}
