import { Router } from "express";
import { checkDatabaseHealth } from "../db";
const router = Router();
router.get("/live", (_req, res) => res.json({ ok: true }));
router.get("/", async (_req, res) => {
  const db = await checkDatabaseHealth();
  res.setHeader("Cache-Control", "no-store");
  res.status(db.ok ? 200 : 503).json({ ok: db.ok, db });
});
export default router;
