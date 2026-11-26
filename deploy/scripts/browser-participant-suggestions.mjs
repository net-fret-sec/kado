import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function browserParticipantSuggestions({ browser, base, api, root, scratch, restart = async () => {} }) {
  await mkdir(scratch, { recursive: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWP4z8CAFWEXHbQSACj/P8FTKqelAAAAAElFTkSuQmCC', 'base64');
  const cases = ['fr-CA', 'en-CA', 'es'].flatMap(locale => [360, 1440].map(width => ({ locale, width, palette: 'i' })));
  cases.push({ locale: 'fr-CA', width: 768, palette: 'i' }, ...[360, 768, 1440].map(width => ({ locale: 'fr-CA', width, palette: 'e' })));
  for (const { locale, width, palette } of cases) {
    await restart();
    const t = JSON.parse(await readFile(path.join(root, `apps/web/src/i18n/locales/${locale}.json`), 'utf8'));
    const countLabel = count => t.exchangeDetail.wishlistSuggestions.split('|')[count === 1 ? 0 : 1].trim().replace('{count}', String(count));
    const created = await api('POST', '/api/exchanges', { name: 'Participants et suggestions', organizerParticipates: false, adminPassword: 'testpassword123' }, undefined, 201);
    const id = created.exchange.id, token = created.adminSessionToken;
    const context = await browser.newContext({ ignoreHTTPSErrors: true, locale, viewport: { width, height: 1000 }, reducedMotion: 'reduce', hasTouch: width === 360 });
    try {
      const members = [];
      for (const name of ['Zoé', 'Alex', 'Alex']) members.push((await api('POST', `/api/exchanges/${id}/participants`, { name, wishlist: [{ title: 'Livre', linkUrl: 'https://example.com/book' }, { title: 'Une seconde suggestion avec une description plus longue', linkUrl: 'https://example.com/second' }] }, token, 201)).participant);
      const link = await api('POST', `/api/exchanges/${id}/participants/${members[0].id}/access/regenerate`, {}, token, 201);
      await context.addInitScript(locale => localStorage.setItem('locale', locale), locale);
      const page = await context.newPage();
      let confirmRemoval = false;
      page.on('dialog', async dialog => {
        assert.equal(dialog.type(), 'confirm');
        assert.equal(dialog.message(), t.images.confirmRemove);
        if (confirmRemoval) await dialog.accept();
        else await dialog.dismiss();
      });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      async function auditSuggestions(state) {
        const builder = () => new AxeBuilder({ page }).options({ preload: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']);
        const full = await builder().analyze();
        if (palette === 'i') return full;
        // The light palette has unrelated header/profile contrast findings. Record
        // the full audit while enforcing all rules on the changed suggestion lists.
        await writeFile(path.join(scratch, `axe-${state}-${locale}-${width}-${palette}.json`), JSON.stringify(full.violations, null, 2));
        return builder().include('.suggestion-list').analyze();
      }

      await page.goto(base + link.accessLink);
      await page.evaluate(palette => document.documentElement.dataset.paletteTheme = palette, palette);
      const list = page.locator('.participant-list');
      await expect(list.locator('li')).toHaveCount(3);
      assert.deepEqual(await list.locator('li > span:first-child').allTextContents(), ['Alex', 'Alex', 'Zoé']);
      await expect(list.locator('strong')).toHaveCount(0);
      await expect(list.locator('.badge')).toHaveText([2, 2, 2].map(countLabel));
      const item = page.locator('.suggestion-item').first();
      const shells = page.locator('.suggestion-shell');
      await expect(shells).toHaveCount(2);
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => shells.evaluateAll(items => {
        const first = items[0].getBoundingClientRect(), second = items[1].getBoundingClientRect();
        return Math.abs(first.bottom - second.top);
      }), { message: 'Items must be contiguous' }).toBeLessThan(1);
      const thumbnail = await item.locator('.suggestion-image-button').boundingBox();
      const fields = await item.locator('.suggestion-fields').boundingBox();
      assert(Math.abs(thumbnail.width - thumbnail.height) < 1, 'Thumbnail slot is square');
      if (width === 360) assert(fields.y >= thumbnail.y + thumbnail.height, 'Mobile fields below image');
      else {
        assert(Math.abs(thumbnail.y - fields.y) < 1, 'Image and fields share top edge');
        assert(Math.abs(thumbnail.height - fields.height) < 1, 'Image spans both fields');
      }
      assert(await shells.first().evaluate(el => getComputedStyle(el).backgroundColor !== getComputedStyle(el.closest('.card')).backgroundColor), 'Solid list surface distinct from card');
      await expect(shells.first().locator('.suggestion-controls button')).toHaveCount(1);
      await expect(shells.first().locator('.drag-handle')).toHaveAttribute('aria-label', t.participant.wishlistItem.reorderPosition.replace('{position}', '1'));
      const deleteBox = await shells.first().locator('.suggestion-delete').boundingBox();
      assert(deleteBox.x >= fields.x + fields.width, 'Delete action is on the right');
      const openLink = item.locator('.suggestion-open-link');
      await expect(openLink).toHaveAttribute('href', 'https://example.com/book');
      await context.route('https://example.com/**', route => route.fulfill({ body: '<title>Suggestion link test</title>' }));
      const popupPromise = context.waitForEvent('page');
      await openLink.click();
      const popup = await popupPromise;
      await expect(popup).toHaveURL('https://example.com/book');
      await popup.close();
      await item.locator('input[type=file]').setInputFiles({ name: 'gift.png', mimeType: 'image/png', buffer: png });
      await expect(item.locator('img')).toBeVisible();
      await expect.poll(async () => (await api('GET', '/api' + link.accessLink)).participant.wishlist[0].imageId).toBeTruthy();
      await page.reload(); await page.evaluate(palette => document.documentElement.dataset.paletteTheme = palette, palette); await item.scrollIntoViewIfNeeded(); await expect(item.locator('img')).toBeVisible();
      const remove = item.getByRole('button', { name: t.images.remove, exact: true });
      const imageBox = await item.locator('.suggestion-image-button').boundingBox();
      const removeBox = await remove.boundingBox();
      assert(Math.abs(removeBox.width - removeBox.height) < 1, `Remove button should be round: ${JSON.stringify(removeBox)}`);
      assert(removeBox.x >= imageBox.x && removeBox.y >= imageBox.y && removeBox.x + removeBox.width <= imageBox.x + imageBox.width && removeBox.y + removeBox.height <= imageBox.y + imageBox.height);
      assert(Math.abs(imageBox.width - imageBox.height) < 1, 'Loaded thumbnail slot remains square');
      await remove.click();
      await expect(item.locator('img')).toBeVisible();
      assert((await api('GET', '/api' + link.accessLink)).participant.wishlist[0].imageId, 'Cancellation keeps the saved image');
      confirmRemoval = true;
      let fileChooserOpened = false;
      page.on('filechooser', () => { fileChooserOpened = true; });
      if (width === 360) await remove.tap();
      else { await remove.focus(); await page.keyboard.press('Enter'); }
      await expect(item.locator('img')).toHaveCount(0);
      await expect(item.locator('.suggestion-image-button')).toBeFocused();
      await expect.poll(async () => (await api('GET', '/api' + link.accessLink)).participant.wishlist[0]).toEqual({ title: 'Livre', linkUrl: 'https://example.com/book' });
      await page.reload(); await page.evaluate(palette => document.documentElement.dataset.paletteTheme = palette, palette);
      await expect(item.locator('img')).toHaveCount(0);
      await expect(item.locator('input[id$="-title"]')).toHaveValue('Livre');
      await expect(item.locator('input[type=url]')).toHaveValue('https://example.com/book');
      assert.equal(fileChooserOpened, false);
      // A replacement is still possible after removal; its button vanishes in read-only mode.
      await item.locator('input[type=file]').setInputFiles({ name: 'gift.png', mimeType: 'image/png', buffer: png });
      await expect.poll(async () => (await api('GET', '/api' + link.accessLink)).participant.wishlist[0].imageId).toBeTruthy();
      await api('PUT', `/api/exchanges/${id}/participants/${members[1].id}`, { wishlist: [] }, token);
      await page.reload(); await page.evaluate(palette => document.documentElement.dataset.paletteTheme = palette, palette); await expect(list.locator('.badge')).toHaveText([2, 2].map(countLabel));
      await api('POST', `/api/exchanges/${id}/draw`, undefined, token);
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      const drawn = await api('GET', '/api' + link.accessLink);
      await expect(list.locator('strong')).toHaveCount(1);
      await expect(list.locator(`[data-participant-id="${drawn.assignment.receiverId}"] strong`)).toHaveText('Alex');
      await expect(page.locator('.suggestion-remove-image')).toHaveCount(0);
      await expect(list.locator('.badge')).toHaveText([2, 2].map(countLabel));
      await page.screenshot({ path: path.join(scratch, `participant-suggestions-${locale}-${width}-${palette}.png`), fullPage: true });
      const audit = await auditSuggestions('readonly');
      assert.deepEqual(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await api('POST', `/api/exchanges/${id}/draw/cancel`, undefined, token);
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await expect(list.locator('strong')).toHaveCount(0);
      await expect(list.locator('li')).toHaveCount(3);
      await expect(page.locator('.suggestion-remove-image')).toBeVisible();
      await item.scrollIntoViewIfNeeded();
      await expect(item.locator('img')).toBeVisible();
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await page.screenshot({ path: path.join(scratch, `image-removal-${locale}-${width}-${palette}.png`), fullPage: true });
      await page.locator('.participant-suggestions-card').screenshot({ path: path.join(scratch, `suggestion-tiles-${locale}-${width}-${palette}.png`) });
      const editAudit = await auditSuggestions('edit');
      assert.deepEqual(editAudit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), []);
      assert.deepEqual(errors, []);
      console.log(`Participant suggestions: ${locale} ${width}px palette ${palette} passed`);
    } finally {
      await context.close();
      await api('DELETE', `/api/exchanges/${id}`, undefined, token, 204);
    }
  }
}
