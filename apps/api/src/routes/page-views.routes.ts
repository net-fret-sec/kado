import { Router } from "express";
import { z } from "zod";
import { recordPageView } from "../services/page-views.service";

const router = Router();
const payload = z.strictObject({
  page: z.enum(["home", "organizer", "participant"]),
});
router.post("/page-views", async (req, res) => {
  const parsed = payload.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).end();
    return;
  }
  if (req.get("DNT") !== "1" && req.get("Sec-GPC") !== "1") {
    await recordPageView(parsed.data.page);
  }
  res.status(204).end();
});
export default router;
