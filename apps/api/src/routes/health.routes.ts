import { Router } from "express";
import { checkDatabaseHealth } from "../db";

const router = Router();

router.get("/", async (_req, res) => {
  const db = await checkDatabaseHealth();

  res.json({
    ok: true,
    db,
  });
});

export default router;
