import { Router } from "express";
import { createExchangeInputSchema, exchangeIdParamSchema } from "@kado/shared";
import { validateBody, validateParams } from "../middleware/validate";
import { createExchange, getExchangeById, listExchanges } from "../services/exchange.service";

const router = Router();

router.post(
  "/",
  validateBody(createExchangeInputSchema),
  async (req, res, next) => {
    try {
      const result = await createExchange(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/", async (_req, res, next) => {
  try {
    const exchanges = await listExchanges();
    res.status(200).json(exchanges);
  } catch (error) {
    next(error);
  }
});

router.get(
  "/:exchangeId",
  validateParams(exchangeIdParamSchema),
  async (req, res, next) => {
    try {
      const exchangeId = Array.isArray(req.params.exchangeId)
        ? req.params.exchangeId[0]
        : req.params.exchangeId;

      const exchange = await getExchangeById(exchangeId);
      res.status(200).json(exchange);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
