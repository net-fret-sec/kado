import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { updateParticipantInputSchema } from "@kado/shared";
import {
  getParticipantSelfViewByToken,
  updateParticipantSelfByToken,
} from "../services/participant.service";
import { getExchangePublicById } from "../services/exchange.service";
import { validateBody } from "../middleware/validate";
import { participantAccessRateGuard } from "../middleware/participant-access-guard";

const router = Router();

const tokenParamSchema = z.object({ token: z.string().min(1) });
const exchangeIdParamSchema = z.object({ exchangeId: z.string().min(1) });

router.get(
  "/public/exchanges/:exchangeId",
  async (req: Request<{ exchangeId: string }>, res, next) => {
    try {
      const parsed = exchangeIdParamSchema.parse(req.params);
      const view = await getExchangePublicById(parsed.exchangeId);
      res.status(200).json(view);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/p/:token",
  participantAccessRateGuard,
  async (req: Request<{ token: string }>, res, next) => {
    try {
      const parsed = tokenParamSchema.parse(req.params);
      const view = await getParticipantSelfViewByToken(parsed.token);
      res.status(200).json(view);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/p/:token",
  participantAccessRateGuard,
  validateBody(updateParticipantInputSchema),
  async (req: Request<{ token: string }>, res, next) => {
    try {
      const parsed = tokenParamSchema.parse(req.params);
      const view = await updateParticipantSelfByToken(parsed.token, req.body);
      res.status(200).json(view);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
