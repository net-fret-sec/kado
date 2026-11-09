import test from "node:test";
import assert from "node:assert/strict";
import { createMonitorServer } from "../server.mjs";
import http from "node:http";
import { once } from "node:events";
import { csvRows, chartBuckets, selectedHours } from "../src/model.mjs";
async function listen(t, options = {}) {
  const server = createMonitorServer(options);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
test("SSH failure preserves last good report and marks stale", async (t) => {
  let fail = false;
  const url = await listen(t, {
    ttl: 0,
    readReport: async () => {
      if (fail) throw Error("SSH indisponible");
      return { schemaVersion: 2, traffic: { hours: [] } };
    },
  });
  assert.equal(
    (await (await fetch(url + "/api/report")).json()).transportStale,
    false,
  );
  fail = true;
  const value = await (await fetch(url + "/api/report")).json();
  assert.equal(value.report.schemaVersion, 2);
  assert.equal(value.transportStale, true);
  assert.match(value.error, /SSH/);
});
test("no report is not a zero and concurrent reads share a single SSH call", async (t) => {
  let calls = 0;
  const url = await listen(t, {
    readReport: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      throw Error("absent");
    },
  });
  const responses = await Promise.all([
    fetch(url + "/api/report"),
    fetch(url + "/api/report"),
  ]);
  assert.equal(calls, 1);
  assert.equal(responses[0].status, 503);
  assert.equal((await responses[0].json()).report, null);
});
test("reject remote origins, DNS rebinding, traversal and writes without SSH", async (t) => {
  let calls = 0;
  const url = await listen(t, {
    readReport: async () => {
      calls++;
    },
  });
  for (const headers of [
    { Origin: "https://evil.example" },
    { Host: "evil.example" },
    { "Sec-Fetch-Site": "cross-site" },
  ]) {
    const status = await new Promise((resolve, reject) => {
      const r = http.get(url + "/api/report", { headers }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      r.on("error", reject);
    });
    assert.equal(status, 403);
  }
  assert.equal(
    (await fetch(url + "/api/report", { method: "POST" })).status,
    405,
  );
  assert.equal((await fetch(url + "/%2e%2e/server.mjs")).status, 404);
  assert.equal(calls, 0);
});
test("local page has CSP and no CORS", async (t) => {
  const url = await listen(t);
  const response = await fetch(url + "/");
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});
test("CSV preserves missing values and Toronto DST days retain both repeated hours", () => {
  const before = Date.parse("2026-11-01T05:00:00Z") / 1000,
    after = before + 3600;
  const rows = [
    {
      at: before,
      value: 1,
      home: { ok: 1, notModified: 0, navigation: 1 },
      complete: true,
    },
    { at: after, value: 2, home: null, complete: false },
  ];
  assert.equal(chartBuckets(rows, 7).length, 1);
  assert.equal(chartBuckets(rows, 7)[0].value, 3);
  const csv = csvRows(rows);
  assert.match(csv, /2026-11-01T05:00:00/);
  assert.match(csv, /2026-11-01T06:00:00/);
  assert.match(csv, /"","",""/);
});
test("missing hourly samples are visible gaps", () => {
  const rows = selectedHours(
    { traffic: { hours: [] } },
    { from: 0, to: 7199, effectiveFrom: 0 },
  );
  assert.equal(rows.length, 2);
  assert(rows.every((r) => r.value === null && !r.complete));
});
