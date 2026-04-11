import { Router } from "express";
import { z } from "zod";
import { exchangeIdParamSchema } from "@kado/shared";
import { validateBody, validateParams } from "../middleware/validate";
import { requireAdminSession } from "../middleware/require-admin-session";
import {
  authenticateAdminSession,
  changeAdminPassword,
  revokeAdminSession,
} from "../services/exchange.service";

const createAdminSessionInputSchema = z.object({
  adminPassword: z.string().min(10).max(256),
});

const changeAdminPasswordInputSchema = z.object({
  currentPassword: z.string().min(10).max(256),
  newPassword: z.string().min(10).max(256),
});

const router = Router();

router.post(
  "/:exchangeId/admin/sessions",
  validateParams(exchangeIdParamSchema),
  validateBody(createAdminSessionInputSchema),
  async (req, res, next) => {
    try {
      const exchangeId = Array.isArray(req.params.exchangeId)
        ? req.params.exchangeId[0]
        : req.params.exchangeId;

      const result = await authenticateAdminSession(
        exchangeId,
        req.body.adminPassword,
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:exchangeId/admin/sessions/current",
  validateParams(exchangeIdParamSchema),
  requireAdminSession,
  async (req, res, next) => {
    try {
      const authorization = req.header("authorization") ?? "";
      const token = authorization.split(" ")[1] ?? "";

      const exchangeId = Array.isArray(req.params.exchangeId)
        ? req.params.exchangeId[0]
        : req.params.exchangeId;

      await revokeAdminSession(exchangeId, token);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:exchangeId/admin/password",
  validateParams(exchangeIdParamSchema),
  validateBody(changeAdminPasswordInputSchema),
  requireAdminSession,
  async (req, res, next) => {
    try {
      const exchangeId = Array.isArray(req.params.exchangeId)
        ? req.params.exchangeId[0]
        : req.params.exchangeId;

      await changeAdminPassword(
        exchangeId,
        req.body.currentPassword,
        req.body.newPassword,
      );

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

export default router;
