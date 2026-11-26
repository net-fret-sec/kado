export const LEGAL_DOCUMENTS = [
  "conditions-utilisation",
  "confidentialite",
] as const;
export const LEGAL_LOCALES = ["fr-CA", "en-CA", "es"] as const;
export type LegalDocumentId = (typeof LEGAL_DOCUMENTS)[number];
export type LegalLocale = (typeof LEGAL_LOCALES)[number];
export interface LegalDocument {
  document: LegalDocumentId;
  locale: LegalLocale;
  title: string;
  status: "draft" | "published";
  effectiveAt: string | null;
  updatedAt: string;
  html: string;
}
