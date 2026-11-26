import { Router } from "express";
import { z } from "zod";
import { LEGAL_DOCUMENTS, LEGAL_LOCALES } from "@kado/shared";
import {
  LegalContentError,
  loadLegalDocument,
} from "../services/legal-content.service";

const router = Router();
router.get("/legal/:document", async (req, res, next) => {
  const document = z.enum(LEGAL_DOCUMENTS).safeParse(req.params.document);
  const locale = z.enum(LEGAL_LOCALES).safeParse(req.query.locale ?? "fr-CA");
  if (!document.success || !locale.success) {
    res
      .status(document.success ? 400 : 404)
      .json({ error: { details: { code: "LEGAL_NOT_FOUND" } } });
    return;
  }
  try {
    res.json(
      await loadLegalDocument(
        process.env.LEGAL_CONTENT_DIR,
        document.data,
        locale.data,
      ),
    );
  } catch (error) {
    if (!(error instanceof LegalContentError)) return next(error);
    console.warn(
      JSON.stringify({
        event: "legal_content_unavailable",
        document: document.data,
        locale: locale.data,
        reason: error.reason,
      }),
    );
    res.status(503).json({ error: { details: { code: "LEGAL_UNAVAILABLE" } } });
  }
});
export default router;
