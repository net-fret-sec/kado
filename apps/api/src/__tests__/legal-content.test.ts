import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { LEGAL_DOCUMENTS, LEGAL_LOCALES } from "@kado/shared";
import { createApp } from "../app";
import {
  loadLegalDocument,
  validateLegalDirectory,
} from "../services/legal-content.service";

let directory: string;
const originalDirectory = process.env.LEGAL_CONTENT_DIR;
const meta = () => ({
  effectiveAt: null as string | null,
  updatedAt: "2026-11-26",
  titles: {
    "fr-CA": "Texte français",
    "en-CA": "English text",
    es: "Texto español",
  },
});
const configuration = () => ({
  version: 1,
  status: "draft",
  variables: {
    serviceName: "Example",
    operatorName: "Example Operator",
    projectName: "Example Project",
    domain: "https://example.com",
    contactEmail: "help+legal@example.com",
  },
  documents: { "conditions-utilisation": meta(), confidentialite: meta() },
});
const writeConfig = (config = configuration()) =>
  writeFile(path.join(directory, "legal-config.json"), JSON.stringify(config));
const filename = () => path.join(directory, "confidentiality.md");
const load = () => loadLegalDocument(directory, "confidentialite", "fr-CA");
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "kado-legal-test-"));
  process.env.LEGAL_CONTENT_DIR = directory;
  await writeConfig();
  for (const locale of LEGAL_LOCALES) {
    const suffix = { "fr-CA": "", "en-CA": "-en", es: "-es" }[locale];
    for (const document of LEGAL_DOCUMENTS)
      await writeFile(
        path.join(
          directory,
          `${document === "confidentialite" ? "confidentiality" : "conditions"}${suffix}.md`,
        ),
        `## ${locale}\n\n{{ serviceName }}: ${document}.\n\n[Contact](mailto:{{ contactEmail }}) — [Site]({{ domain }}).`,
      );
  }
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
  if (originalDirectory === undefined) delete process.env.LEGAL_CONTENT_DIR;
  else process.env.LEGAL_CONTENT_DIR = originalDirectory;
  jest.restoreAllMocks();
});

it("serves all six documents publicly without caching or exposing configuration", async () => {
  const app = createApp();
  for (const document of LEGAL_DOCUMENTS)
    for (const locale of LEGAL_LOCALES) {
      const response = await request(app)
        .get(`/api/legal/${document}?locale=${locale}`)
        .expect(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body).toMatchObject({
        document,
        locale,
        status: "draft",
        effectiveAt: null,
        updatedAt: "2026-11-26",
      });
      expect(response.body.html).toContain(`<h2>${locale}</h2>`);
      expect(response.body.html).toContain(
        'href="mailto:help+legal@example.com"',
      );
      expect(response.body.html).toContain('href="https://example.com"');
      expect(response.body).not.toHaveProperty("variables");
      expect(JSON.stringify(response.body)).not.toContain(directory);
    }
});

it("rereads text and configuration without restarting and does not serve stale content", async () => {
  const app = createApp();
  await request(app).get("/api/legal/confidentialite").expect(200);
  await writeFile(filename(), "## Changed\n\nNew {{ serviceName }}.");
  const config = configuration();
  config.variables.serviceName = "Updated Example";
  config.documents.confidentialite.updatedAt = "2026-11-27";
  await writeConfig(config);
  const response = await request(app)
    .get("/api/legal/confidentialite")
    .expect(200);
  expect(response.body.html).toContain("New Updated Example.");
  expect(response.body.updatedAt).toBe("2026-11-27");
  await rm(filename());
  const unavailable = await request(app)
    .get("/api/legal/confidentialite")
    .expect(503);
  expect(unavailable.body).toEqual({
    error: { details: { code: "LEGAL_UNAVAILABLE" } },
  });
  expect(unavailable.headers["cache-control"]).toBe("no-store");
});

it("rejects unknown documents, query arrays and path-like locales", async () => {
  const app = createApp();
  await request(app).get("/api/legal/config.json").expect(404);
  for (const query of [
    "locale=fr",
    "locale=../../",
    "locale=es&locale=fr-CA",
    "locale=",
  ])
    await request(app).get(`/api/legal/confidentialite?${query}`).expect(400);
  await rm(path.join(directory, "confidentiality-es.md"));
  const fallback = await request(app)
    .get("/api/legal/confidentialite?locale=es")
    .expect(200);
  expect(fallback.body.locale).toBe("fr-CA");
  expect(fallback.body.title).toBe("Texte français");
  await rm(filename());
  await request(app).get("/api/legal/confidentialite?locale=es").expect(503);
});

it("renders raw HTML as text and blocks executable links and embedded resources", async () => {
  await writeFile(
    filename(),
    [
      '<script>alert(1)</script><img src=x onerror="alert(1)">',
      "[bad](javascript:alert%281%29)",
      "[bad](data:text/html,attack)",
      "[bad](vbscript:attack)",
      "[bad](//example.com)",
      "[bad](/api/secret)",
      "![image](https://example.com/track.png)",
      "[ok](/conditions-utilisation)",
      "[web](https://example.com)",
      "[mail](mailto:{{ contactEmail }})",
    ].join("\n\n"),
  );
  const { html } = await load();
  expect(html).not.toMatch(/<(?:script|img)\b/i);
  expect(html).not.toMatch(
    /href="(?:javascript:|data:|vbscript:|\/\/|\/api\/)/i,
  );
  expect(html).toContain('href="/conditions-utilisation"');
  expect(html).toContain('href="https://example.com"');
  expect(html).toContain('href="mailto:help+legal@example.com"');
  const config = configuration();
  config.variables.serviceName =
    "[inject](https://evil.example)<script>test</script>";
  await writeConfig(config);
  await writeFile(filename(), "{{ serviceName }}");
  expect((await load()).html).not.toMatch(/<a |<script>/);
});

it.each([
  "",
  "   ",
  "{{ unknown }}",
  "{{ malformed",
  "# Duplicate title",
  "a".repeat(262145),
])("rejects invalid Markdown case %#", async (source) => {
  await writeFile(filename(), source);
  await expect(load()).rejects.toThrow("Legal content is unavailable.");
});

it("rejects invalid UTF-8, invalid configuration and escaping symlinks", async () => {
  await writeFile(filename(), Buffer.from([0xff]));
  await expect(load()).rejects.toThrow();
  await rm(filename());
  const outside = `${directory}-outside.md`;
  try {
    await writeFile(outside, "Secret outside root");
    await symlink(outside, filename());
    await expect(load()).rejects.toMatchObject({ reason: "file" });
    await rm(path.join(directory, "legal-config.json"));
    await symlink(outside, path.join(directory, "legal-config.json"));
    await expect(load()).rejects.toMatchObject({ reason: "file" });
  } finally {
    await rm(outside, { force: true });
  }
});

it("requires valid dates for publication and refuses draft content in production mode", async () => {
  await expect(validateLegalDirectory(directory)).resolves.toBeUndefined();
  await expect(
    loadLegalDocument(directory, "confidentialite", "fr-CA", false),
  ).rejects.toMatchObject({ reason: "draft" });
  await expect(validateLegalDirectory(directory, true)).rejects.toThrow();
  const config = configuration();
  config.status = "published";
  await writeConfig(config);
  await expect(load()).rejects.toMatchObject({ reason: "config" });
  for (const id of LEGAL_DOCUMENTS)
    config.documents[id].effectiveAt = "2026-11-26";
  await writeConfig(config);
  await expect(
    validateLegalDirectory(directory, true),
  ).resolves.toBeUndefined();
  config.documents.confidentialite.updatedAt = "2026-02-30";
  await writeConfig(config);
  await expect(load()).rejects.toMatchObject({ reason: "config" });
  await writeFile(path.join(directory, "legal-config.json"), "{broken");
  await expect(load()).rejects.toMatchObject({ reason: "config" });
  await expect(
    loadLegalDocument(undefined, "confidentialite", "fr-CA"),
  ).rejects.toMatchObject({ reason: "unconfigured" });
});

it("prefers each suffixed file, falls back only when absent and supports base-only installations", async () => {
  const override = path.join(directory, "confidentiality-fr.md");
  await writeFile(override, "## Version prioritaire");
  expect((await load()).html).toContain("Version prioritaire");
  await writeFile(override, "");
  await expect(load()).rejects.toThrow();
  await rm(override);
  expect((await load()).html).toContain("fr-CA");
  for (const basename of ["conditions", "confidentiality"])
    for (const suffix of ["en", "es"])
      await rm(path.join(directory, `${basename}-${suffix}.md`));
  await expect(validateLegalDirectory(directory)).resolves.toBeUndefined();
  const fallback = await loadLegalDocument(
    directory,
    "conditions-utilisation",
    "en-CA",
  );
  expect(fallback.locale).toBe("fr-CA");
  expect(fallback.title).toBe("Texte français");
});
