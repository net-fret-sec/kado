import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir } from "node:fs/promises";
const base = process.env.KADO_UX_BASE ?? "http://127.0.0.1:5179";
const output = process.env.KADO_UX_OUTPUT ?? "/tmp/kado-ux";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const members = Array.from({ length: 50 }, (_, i) => ({
    id: `p${i}`,
    name: i === 0 ? "Dave" : i === 1 ? "Stéphane" : `Participant ${i + 1}`,
    status: "active",
    wishlist: [],
    updatedAt: "2026-10-14T12:00:00Z",
  }));
  let drawn = false;
  let rules = [
    { id: "r1", giverParticipantId: "p0", receiverParticipantId: "p1" },
  ];
  const writes = [];
  const removals = [];
  // All API calls are intercepted: this check never reads or writes application data.
  await page.addInitScript(() =>
    localStorage.setItem(
      "kado.adminSessions",
      JSON.stringify({ demo: "synthetic" }),
    ),
  );
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    let body;
    if (req.method() === "DELETE" && url.pathname.includes("/exclusions/")) {
      const id = url.pathname.split("/").at(-1);
      removals.push(id);
      rules = rules.filter((rule) => rule.id !== id);
      await route.fulfill({ status: 204 });
      return;
    }
    if (url.pathname.endsWith("/config")) body = { maxActiveParticipants: 50 };
    else if (url.pathname.endsWith("/exclusions")) {
      if (req.method() === "POST") {
        const rule = { id: "r2", ...req.postDataJSON() };
        writes.push(rule);
        rules.push(rule);
        body = rule;
      } else body = rules;
    } else
      body = {
        id: "demo",
        name: "Échange des fêtes",
        organizerName: "Dave",
        description: "Un cadeau choisi avec attention, pour célébrer ensemble.",
        eventDate: "2026-12-20",
        budget: 35,
        isDrawn: drawn,
        isArchived: false,
        noMutualAssignments: true,
        minWishlistSuggestions: 2,
        lockSuggestionsAfterDraw: true,
        participants: members,
        createdAt: "2026-10-14T12:00:00Z",
        updatedAt: "2026-10-14T12:00:00Z",
      };
    await route.fulfill({ json: body });
  });
  await page.goto(base + "/exchanges/demo");
  await page
    .getByRole("heading", { name: "Échange des fêtes", exact: true })
    .waitFor();
  assert.equal(await page.locator("#participants select").count(), 0);
  assert.equal(await page.locator("#participants details[open]").count(), 0);
  await page.screenshot({
    path: path.join(output, "desktop.png"),
    fullPage: false,
  });
  await page.locator("#settings details").last().locator("summary").click();
  await page.locator("#exclusion-giver").selectOption("p1");
  await page.locator("#exclusion-receiver").selectOption("p0");
  await page.locator("#settings form button").click();
  await page.waitForTimeout(150);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].giverParticipantId, "p1");
  assert.equal(writes[0].receiverParticipantId, "p0");
  await page.locator("#participants details summary").first().focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#participants details[open]").count(), 1);
  let result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    [],
  );
  await page.setViewportSize({ width: 360, height: 900 });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(5000);
  await page.screenshot({
    path: path.join(output, "mobile.png"),
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    [],
  );
  await page.locator("#settings li button").last().click();
  await page.waitForTimeout(150);
  assert.deepEqual(removals, ["r2"]);
  assert.equal(await page.locator("#settings li").count(), 1);
  drawn = true;
  await page.reload();
  await page.getByText("La pige a été effectuée.", { exact: true }).waitFor();
  assert.equal(await page.locator("#exclusion-giver").count(), 0);
  await page.goto(base + "/x/demo");
  await page.getByRole("heading", { name: /introuvable/i }).waitFor();
  await page.goto(base + "/");
  assert.equal(await page.locator("#received-link").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Validated: 50 participants, desktop/mobile, keyboard expansion, directional write/removal, drawn lock, removed public route, home, axe (0 violations).",
  );
} finally {
  await browser.close();
}
