import { spawnSync, spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import net from "node:net";
import https from "node:https";
const listener = net.createServer();
await new Promise((r) => listener.listen(0, "127.0.0.1", r));
const httpsPort = listener.address().port;
await new Promise((r) => listener.close(r));
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const root = path.resolve(import.meta.dirname, "../..");
const scratch = await mkdtemp(path.join(tmpdir(), "kado-p1-smoke-"));
const project = "kado-p1-" + randomUUID().slice(0, 8),
  tag = process.env.KADO_IMAGE_TAG ?? "p1-local";
const db = "kado_test_" + randomUUID().replaceAll("-", "");
const password = randomUUID();
let browser;
function run(args, options = {}) {
  const r = spawnSync(args[0], args.slice(1), {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
  if (r.status !== 0)
    throw new Error(
      `Command failed: ${args.slice(0, 3).join(" ")}: ${r.stderr ?? ""}`,
    );
  return r.stdout?.trim() ?? "";
}
const envFile = path.join(scratch, "env"),
  apiFile = path.join(scratch, "api.env"),
  override = path.join(scratch, "compose.json");
await writeFile(
  apiFile,
  `FRONTEND_BASE_URL=https://kado.test\nFRONTEND_ALLOWED_ORIGINS=https://kado.test,https://localhost:${httpsPort}\nAPI_RATE_LIMIT=80\nAPI_RATE_WINDOW_MS=300000\nCREATE_RATE_LIMIT=10\nMAX_ACTIVE_PARTICIPANTS=50\n`,
  { mode: 0o600 },
);
await writeFile(
  envFile,
  `COMPOSE_PROJECT_NAME=${project}\nPOSTGRES_DB=${db}\nPOSTGRES_USER=kado_test\nPOSTGRES_PASSWORD=${password}\nIMAGE_TAG=${tag}\nDOMAIN=https://localhost\nACME_EMAIL=smoke@example.com\nKADO_API_ENV_FILE=${apiFile}\n`,
  { mode: 0o600 },
);
const production = run([
  "docker",
  "compose",
  "--env-file",
  envFile,
  "-f",
  "deploy/docker-compose.prod.yml",
  "config",
  "--format",
  "json",
]);
const config = JSON.parse(production);
config.name = project;
// Preserve production service definitions; change only test exposure and retry cadence.
config.services.caddy.ports = [
  {
    target: 443,
    published: String(httpsPort),
    host_ip: "127.0.0.1",
    protocol: "tcp",
  },
];
const testCaddy = path.join(scratch, "Caddyfile");
await writeFile(
  testCaddy,
  (await readFile(path.join(root, "deploy/Caddyfile"), "utf8")).replace(
    "{$DOMAIN} {",
    "{$DOMAIN} {\n  tls internal",
  ),
);
config.services.caddy.volumes.push({
  type: "bind",
  source: testCaddy,
  target: "/etc/caddy/Caddyfile",
  read_only: true,
});
for (const v of Object.values(config.volumes)) {
  delete v.name;
}
await writeFile(override, JSON.stringify(config));
const compose = (...args) =>
  run(["docker", "compose", "--env-file", envFile, "-f", override, ...args]);
let base;
function localFetch(url, options = {}) {
  assert.equal(new URL(url).hostname, "localhost");
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { ...options, rejectUnauthorized: false },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode,
              headers: res.headers,
            }),
          ),
        );
      },
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}
async function api(method, url, body, token, expected = 200) {
  const response = await localFetch(base + url, {
    method,
    headers: {
      Host: "localhost",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  assert.equal(
    response.status,
    expected,
    `${method} ${url.replace(/\/p\/.*/, "/p/[redacted]")}: ${text}`,
  );
  return text ? JSON.parse(text) : null;
}
try {
  compose("up", "-d", "--wait", "--wait-timeout", "90", "db");
  compose("run", "--rm", "--no-deps", "api", "node", "dist/migrate.cjs");
  compose("up", "-d", "--wait", "--wait-timeout", "90");
  base = `https://localhost:${httpsPort}`;
  const response = await localFetch(base, { headers: { Host: "localhost" } });
  assert.equal(response.status, 200);
  const csp = response.headers.get("content-security-policy");
  assert(csp.includes("script-src 'self'"));
  assert(!csp.includes("'unsafe-eval'"));
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const created = await api(
    "POST",
    "/api/exchanges",
    {
      name: "Smoke",
      organizerName: "Host",
      organizerParticipates: false,
      adminPassword: "testpassword123",
    },
    undefined,
    201,
  );
  const id = created.exchange.id;
  let token = created.adminSessionToken;
  const members = [];
  for (let i = 0; i < 3; i++)
    members.push(
      await api(
        "POST",
        `/api/exchanges/${id}/participants`,
        {
          name: `Member ${i}`,
          wishlist: [
            {
              title: "Gift",
              imageUrl: "https://example.com/gift.png",
              linkUrl: "https://example.com/gift",
            },
          ],
        },
        token,
        201,
      ),
    );
  await api("POST", `/api/exchanges/${id}/draw`, undefined, token);
  const self = await api("GET", "/api" + members[0].accessLink);
  assert(self.assignment);
  assert.equal(self.exchange.isDrawn, true);
  const rotated = await api(
    "POST",
    `/api/exchanges/${id}/participants/${members[0].participant.id}/access/regenerate`,
    {},
    token,
    201,
  );
  await api("GET", "/api" + members[0].accessLink, undefined, undefined, 404);
  assert((await api("GET", "/api" + rotated.accessLink)).assignment);
  await api("POST", `/api/exchanges/${id}/draw/cancel`, undefined, token);
  const replacement = await api(
    "PUT",
    `/api/exchanges/${id}/admin/password`,
    { currentPassword: "testpassword123", newPassword: "newpassword123" },
    token,
  );
  await api("GET", `/api/exchanges/${id}`, undefined, token, 401);
  token = replacement.adminSessionToken;
  const network = run([
    "docker",
    "inspect",
    "--format",
    "{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}",
    compose("ps", "-q", "api"),
  ]);
  // Separate real proxy clients: changing forwarded headers must not reset either client's quota.
  const clientScript = `const {request}=await import('node:https');for(let i=0;i<Number(process.env.COUNT ?? 1);i++)await new Promise((resolve,reject)=>{const r=request({hostname:'caddy',servername:'localhost',port:443,path:'/api/config',rejectUnauthorized:false,headers:{Host:'localhost','X-Forwarded-For':Number(process.env.COUNT ?? 1)>1?'192.0.2.'+(i%200+1):process.env.SPOOF}},response=>{console.log(response.statusCode);response.resume();response.on('end',resolve);});r.on('error',reject);r.end();});`;
  const client = (name, spoof, count = 1) =>
    run([
      "docker",
      "exec",
      "-e",
      "SPOOF=" + spoof,
      "-e",
      "COUNT=" + count,
      name,
      "node",
      "--input-type=module",
      "-e",
      clientScript,
    ]);
  const clients = [project + "-client-a", project + "-client-b"];
  for (const name of clients)
    run([
      "docker",
      "run",
      "-d",
      "--name",
      name,
      "--network",
      network,
      "kado-api:" + tag,
      "node",
      "-e",
      "setInterval(()=>{},10000)",
    ]);
  try {
    assert.deepEqual(
      client(clients[0], "192.0.2.1", 80).split("\n"),
      Array(80).fill("200"),
    );
    assert.equal(client(clients[0], "198.51.100.1"), "429");
    assert.equal(client(clients[1], "198.51.100.1"), "200");
  } finally {
    for (const name of clients) run(["docker", "rm", "-f", name]);
  }
  // Real dump, destructive restore only in this explicitly disposable stack.
  const backups = path.join(scratch, "backups");
  await mkdir(backups);
  const opsEnv = {
    ...process.env,
    KADO_COMPOSE_FILE: override,
    KADO_OPERATION_LOCK: path.join(scratch, "operation.lock"),
  };
  run(["bash", "deploy/scripts/backup-db.sh", envFile, backups], {
    env: opsEnv,
  });
  const { readdir } = await import("node:fs/promises");
  const dump = (await readdir(backups)).find((n) => n.endsWith(".dump"));
  await api("PUT", `/api/exchanges/${id}`, { name: "After backup" }, token);
  run(
    ["bash", "deploy/scripts/restore-db.sh", envFile, path.join(backups, dump)],
    { env: opsEnv, input: "RESTORE_KADO\n" },
  );
  assert.equal(
    (await api("GET", `/api/exchanges/${id}`, undefined, token)).name,
    "Smoke",
  );
  const corrupt = path.join(scratch, "corrupt.dump");
  await writeFile(corrupt, "invalid");
  assert.throws(() =>
    run(["bash", "deploy/scripts/restore-db.sh", envFile, corrupt], {
      env: opsEnv,
      input: "RESTORE_KADO\n",
    }),
  );
  await api("GET", "/health");
  // Browser verification against the production assets, CSP and real API.
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const violations = [];
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.exposeFunction("recordViolation", (value) =>
    violations.push(value),
  );
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      window.recordViolation({
        directive: e.violatedDirective,
        uri: e.blockedURI,
      }),
    );
  });
  await page.goto(base + "/");
  await page.locator("#app button").first().waitFor();
  await page
    .getByRole("button", { name: /créer|create/i })
    .first()
    .click();
  await page.locator("#exchangeName").fill("Browser event");
  await page.locator("#organizerName").fill("Browser host");
  await page.locator("#organizerParticipates").uncheck();
  await page.locator("#adminPassword").fill("browserpassword123");
  const creation = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/exchanges") && r.request().method() === "POST",
  );
  await page.locator("button[form=createExchangeForm]").click();
  assert.equal((await creation).status(), 201);
  // Explicit admin route ensures the remainder is independent of modal countdown text.
  await context.addInitScript(
    ({ id, token }) =>
      localStorage.setItem(
        "kado.adminSessions",
        JSON.stringify({ [id]: token }),
      ),
    { id, token },
  );
  await page.goto(base + `/exchanges/${id}`);
  await page.waitForTimeout(500);
  await page.screenshot({
    path:
      process.env.KADO_SMOKE_SCREENSHOT ?? path.join(scratch, "browser.png"),
  });
  const fr = JSON.parse(
    await readFile(
      path.join(root, "apps/web/src/i18n/locales/fr-CA.json"),
      "utf8",
    ),
  );
  page.on("dialog", (dialog) => dialog.accept());
  const drawResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/exchanges/${id}/draw`) &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: fr.exchangeDetail.triggerDraw, exact: true })
    .click();
  assert.equal((await drawResponse).status(), 200);
  const recipient = (await api("GET", "/api" + rotated.accessLink)).assignment
    .receiverName;
  await page.goto(base + rotated.accessLink);
  await page.getByText(recipient).first().waitFor();
  await page.goto(base + `/exchanges/${id}`);
  const cancelResponse = page.waitForResponse((r) =>
    r.url().endsWith(`/api/exchanges/${id}/draw/cancel`),
  );
  await page
    .getByRole("button", { name: fr.exchangeDetail.cancelDraw, exact: true })
    .click();
  assert.equal((await cancelResponse).status(), 200);
  const rotateResponse = page.waitForResponse((r) =>
    r.url().endsWith("/access/regenerate"),
  );
  await page
    .getByRole("button", { name: fr.exchangeDetail.generateLink, exact: true })
    .first()
    .click();
  const newLink = await (await rotateResponse).json();
  await api("GET", "/api" + rotated.accessLink, undefined, undefined, 404);
  await page.goto(base + newLink.accessLink);
  await page.locator("#participant-name").waitFor();
  assert.equal(await page.locator("#participant-name").inputValue(),"Member 0");
  const resources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((e) => e.name),
  );
  assert(resources.some((n) => n.includes("/assets/")));

  assert.equal(
    violations.filter(
      (v) =>
        v.directive.startsWith("script-src") ||
        v.directive.startsWith("connect-src"),
    ).length,
    0,
    JSON.stringify(violations),
  );
  assert.deepEqual(errors, []);
  await page.goto(base + newLink.accessLink);
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(async () => {
      const keys = await caches.keys();
      for (const k of keys) {
        for (const r of await (await caches.open(k)).keys())
          if (new URL(r.url).pathname.startsWith("/api")) return true;
      }
      return false;
    }),
    false,
  );
  // Check SIGTERM readiness and clean exit using the actual Node process.
  const container = compose("ps", "-q", "api");
  compose("stop", "-t", "15", "api");
  assert.equal(
    run(["docker", "inspect", "--format", "{{.State.ExitCode}}", container]),
    "0",
  );
  compose("up", "-d", "--wait", "--wait-timeout", "90", "api");
  // Failure health must be 503 while liveness remains successful.
  compose("stop", "db");
  await api("GET", "/health", undefined, undefined, 503);
  await api("GET", "/health/live");
  console.log(
    "Production images: API lifecycle, Caddy/CSP, IP quotas, backup/restore, browser and shutdown verified.",
  );
} finally {
  await browser?.close();
  try {
    compose("down", "-v", "--remove-orphans");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
