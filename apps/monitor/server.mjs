import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const execute = promisify(execFile);
const directory = path.dirname(fileURLToPath(import.meta.url));

export async function readProductionReport() {
  const config =
    process.env.KADO_MONITOR_SSH_CONFIG ?? path.join(homedir(), ".ssh/config");
  const args = [
    ...(existsSync(config) ? ["-F", config] : []),
    "-T",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "ServerAliveInterval=5",
    "-o",
    "ServerAliveCountMax=2",
    "netfretsec",
    "bash",
    "/opt/kado/deploy/scripts/status.sh",
    "--json",
    "--read-only",
    "--history",
  ];
  let output;
  try {
    output = (
      await execute("ssh", args, { timeout: 40000, maxBuffer: 8 * 1024 * 1024 })
    ).stdout;
  } catch (error) {
    // Status 1 is a valid report with an unhealthy component. Never expose SSH stderr.
    if (error.code === 1 && error.stdout) output = error.stdout;
    else
      throw new Error(
        "Connexion SSH ou bilan indisponible. Vérifier l’accès netfretsec et l’installation du collecteur version 2.",
      );
  }
  let report;
  try {
    report = JSON.parse(output);
  } catch {
    throw new Error("Le serveur n’a pas renvoyé un bilan valide.");
  }
  if (
    report.schemaVersion !== 2 ||
    !report.traffic?.periods ||
    !Array.isArray(report.traffic.hours)
  ) {
    throw new Error(
      "Le tableau de bord nécessite le collecteur version 2 et son historique sur le serveur.",
    );
  }
  return report;
}

export function createMonitorServer({
  readReport = readProductionReport,
  assets = path.join(directory, "dist"),
  ttl = 50000,
} = {}) {
  let lastReport = null,
    lastSuccessAt = null,
    lastError = null,
    lastAttempt = 0,
    pending = null;
  async function refresh() {
    if (pending) return pending;
    if (lastAttempt && Date.now() - lastAttempt < ttl) return;
    lastAttempt = Date.now();
    pending = (async () => {
      try {
        lastReport = await readReport();
        lastSuccessAt = new Date().toISOString();
        lastError = null;
      } catch (error) {
        lastError = error.message || "Bilan indisponible.";
      } finally {
        pending = null;
      }
    })();
    return pending;
  }
  const server = createServer(async (request, response) => {
    const port = server.address()?.port;
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    const origin = request.headers.origin;
    if (
      !hosts.has(request.headers.host) ||
      (origin && ![...hosts].some((h) => origin === `http://${h}`)) ||
      request.headers["sec-fetch-site"] === "cross-site"
    ) {
      response.writeHead(403);
      response.end("Accès local uniquement.");
      return;
    }
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { ...headers, Allow: "GET, HEAD" });
      response.end();
      return;
    }
    let pathname;
    try {
      pathname = new URL(request.url, "http://localhost").pathname;
    } catch {
      response.writeHead(400, headers);
      response.end();
      return;
    }
    if (pathname === "/api/report") {
      if (request.method === "GET") await refresh();
      response.writeHead(lastReport ? 200 : 503, {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(
        request.method === "HEAD"
          ? undefined
          : JSON.stringify({
              report: lastReport,
              lastSuccessAt,
              error: lastError,
              transportStale: !!lastError,
            }),
      );
      return;
    }
    // No file paths or SSH commands are accepted from the browser.
    const name =
      pathname === "/"
        ? "index.html"
        : /^\/assets\/[a-zA-Z0-9_.-]+$/.test(pathname)
          ? pathname.slice(1)
          : null;
    if (!name) {
      response.writeHead(404, headers);
      response.end();
      return;
    }
    try {
      const file = path.join(assets, name);
      if (!(await stat(file)).isFile()) throw new Error("Missing asset");
      const content = await readFile(file);
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
      };
      response.writeHead(200, {
        ...headers,
        "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch {
      response.writeHead(404, headers);
      response.end();
    }
  });
  return server;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.KADO_MONITOR_PORT ?? 4317);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Port local invalide.");
  const server = createMonitorServer();
  server.on("error", () => {
    console.error(
      "Impossible d’ouvrir le tableau de bord local. Vérifier KADO_MONITOR_PORT.",
    );
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `Kado — tableau de bord privé : http://127.0.0.1:${server.address().port}`,
    ),
  );
}
