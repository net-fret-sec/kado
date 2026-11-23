import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

// Measure at the top, independent of focus-driven scrolling or restored scroll position.
export async function expectTopSpacing(page, firstBlock) {
  await expect(firstBlock).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const topbar = await page.locator('.app-topbar').boundingBox();
  const block = await firstBlock.boundingBox();
  assert(Math.abs(block.y - topbar.y - topbar.height - 28) < 1, '28px below Kado topbar');
}

export async function expectFieldGroup(group) {
  const geometry = await group.evaluate(el => {
    const field = el.querySelector('input, select');
    const button = el.querySelector(':scope > button');
    const f = getComputedStyle(field), b = getComputedStyle(button);
    const fr = field.getBoundingClientRect(), br = button.getBoundingClientRect();
    return {
      fieldRadius: [f.borderTopLeftRadius, f.borderBottomLeftRadius],
      buttonRadius: [b.borderTopRightRadius, b.borderBottomRightRadius],
      joins: [f.borderTopRightRadius, f.borderBottomRightRadius, b.borderTopLeftRadius, b.borderBottomLeftRadius],
      y: Math.abs(fr.y - br.y), height: Math.abs(fr.height - br.height), seam: Math.abs(fr.right - br.left),
    };
  });
  assert.deepEqual(geometry.buttonRadius, geometry.fieldRadius, 'Matching outer radii');
  assert.deepEqual(geometry.joins, ['0px', '0px', '0px', '0px'], 'Square inner joins');
  assert(geometry.y < 1 && geometry.height < 1 && geometry.seam <= 1, 'Aligned, continuous field/button group');
}
