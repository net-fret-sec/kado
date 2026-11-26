import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import MarkdownIt from "markdown-it";
import { z } from "zod";
import {
  LEGAL_DOCUMENTS,
  LEGAL_LOCALES,
  type LegalDocument,
  type LegalDocumentId,
  type LegalLocale,
} from "@kado/shared";

const singleLine = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[^\x00-\x1f{}]+$/);
const metadata = z
  .object({
    effectiveAt: z.iso.date().nullable(),
    updatedAt: z.iso.date(),
    titles: z
      .object({ "fr-CA": singleLine, "en-CA": singleLine, es: singleLine })
      .strict(),
  })
  .strict();
export const legalConfigSchema = z
  .object({
    version: z.literal(1),
    defaultLocale: z.enum(LEGAL_LOCALES).default("fr-CA"),
    status: z.enum(["draft", "published"]),
    variables: z
      .object({
        serviceName: singleLine,
        operatorName: singleLine,
        projectName: singleLine,
        domain: z.url().refine((value) => {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            url.pathname === "/" &&
            !url.search &&
            !url.hash
          );
        }),
        contactEmail: z.email().max(254),
      })
      .strict(),
    documents: z
      .object({
        "conditions-utilisation": metadata,
        confidentialite: metadata,
      })
      .strict(),
  })
  .strict()
  .refine(
    (config) =>
      config.status !== "published" ||
      LEGAL_DOCUMENTS.every((id) => config.documents[id].effectiveAt !== null),
    "Published documents require an effective date.",
  );

export class LegalContentError extends Error {
  constructor(
    public readonly reason:
      | "unconfigured"
      | "file"
      | "config"
      | "template"
      | "draft",
  ) {
    super("Legal content is unavailable.");
  }
}

// No raw HTML, images, plugins or automatic external resources. Only the legal
// documents and explicit web/mail links can be linked from this small reader.
const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
}).disable("image");
markdown.validateLink = (href) => {
  if (/^\/(?:confidentialite|conditions-utilisation)(?:#[\w-]+)?$/.test(href))
    return true;
  if (/^#[\w-]+$/.test(href)) return true;
  if (/\s|[\x00-\x1f\\]/.test(href)) return false;
  try {
    const url = new URL(href);
    return (
      ["https:", "http:", "mailto:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};

async function readInside(root: string, relative: string, maxBytes: number) {
  try {
    const filename = await realpath(path.join(root, relative));
    if (!filename.startsWith(root + path.sep))
      throw new Error("Outside content directory");
    const handle = await open(filename, "r");
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > maxBytes)
        throw new Error("Invalid file");
      const bytes = Buffer.alloc(maxBytes + 1);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await handle.read(
          bytes,
          length,
          bytes.length - length,
          length,
        );
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > maxBytes) throw new Error("File too large");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(0, length),
      );
      if (!text.trim()) throw new Error("Empty file");
      return text;
    } finally {
      await handle.close();
    }
  } catch {
    throw new LegalContentError("file");
  }
}

function render(source: string, variables: Record<string, string>) {
  const placeholder = /{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g;
  if (source.replace(placeholder, "").includes("{{"))
    throw new LegalContentError("template");
  const expanded = source.replace(placeholder, (_match, key: string) => {
    if (!Object.hasOwn(variables, key)) throw new LegalContentError("template");
    // Values remain text, including inside Markdown link destinations.
    return variables[key]!.replace(
      /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/g,
      "\\$&",
    );
  });
  const tokens = markdown.parse(expanded, {});
  if (
    tokens.some((token) => token.type === "heading_open" && token.tag === "h1")
  )
    throw new LegalContentError("template");
  return markdown.renderer.render(tokens, markdown.options, {});
}

export async function loadLegalDocument(
  directory: string | undefined,
  document: LegalDocumentId,
  locale: LegalLocale,
  allowDraft = process.env.NODE_ENV !== "production",
): Promise<LegalDocument> {
  if (!directory?.trim()) throw new LegalContentError("unconfigured");
  if (!LEGAL_DOCUMENTS.includes(document) || !LEGAL_LOCALES.includes(locale))
    throw new LegalContentError("file");
  let root: string;
  try {
    root = await realpath(directory);
  } catch {
    throw new LegalContentError("file");
  }
  const raw = await readInside(root, "legal-config.json", 65536);
  let config: z.infer<typeof legalConfigSchema>;
  try {
    config = legalConfigSchema.parse(JSON.parse(raw));
  } catch {
    throw new LegalContentError("config");
  }
  if (!allowDraft && config.status === "draft")
    throw new LegalContentError("draft");
  const basename =
    document === "confidentialite" ? "confidentiality" : "conditions";
  const suffix = { "fr-CA": "fr", "en-CA": "en", es: "es" }[locale];
  let filename = `${basename}-${suffix}.md`;
  let contentLocale = locale;
  try {
    // Only an absent translation uses the base document. An unreadable, empty or
    // invalid override must be fixed, rather than silently hidden by a fallback.
    await lstat(path.join(root, filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new LegalContentError("file");
    filename = `${basename}.md`;
    contentLocale = config.defaultLocale;
  }
  const source = await readInside(root, filename, 262144);
  const meta = config.documents[document];
  return {
    document,
    locale: contentLocale,
    title: meta.titles[contentLocale],
    status: config.status,
    effectiveAt: meta.effectiveAt,
    updatedAt: meta.updatedAt,
    html: render(source, config.variables),
  };
}

export async function validateLegalDirectory(
  directory: string,
  published = false,
) {
  for (const document of LEGAL_DOCUMENTS)
    for (const locale of LEGAL_LOCALES) {
      try {
        await loadLegalDocument(directory, document, locale, !published);
      } catch (error) {
        if (!(error instanceof LegalContentError)) throw error;
        throw new Error(
          `${document} (${locale}): ${error.reason}. ${error.message}`,
        );
      }
    }
}
