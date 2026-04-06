import { Router } from "express";
import {
  createExchangeInputSchema,
  createExclusionRuleInputSchema,
  exchangeAndExclusionRuleIdParamSchema,
  exchangeIdParamSchema,
  updateExchangeInputSchema,
} from "@kado/shared";
import { validateBody, validateParams } from "../middleware/validate";
import { createExchange, getExchangeById, listExchanges, updateExchange, deleteExchange, drawExchange, cancelExchangeDraw } from "../services/exchange.service";
import {
  createExclusionRule,
  deleteExclusionRule,
  listExclusionRules,
} from '../services/exclusion-rule.service'

const router = Router();

router.post(
  "/",
  validateBody(createExchangeInputSchema),
  async (req, res, next) => {
    try {
      console.log("[POST /api/exchanges] Body reçu:", req.body);
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
      next(error)
    }
  },
);

router.put(
  "/:exchangeId",
  validateParams(exchangeIdParamSchema),
  validateBody(updateExchangeInputSchema),
  async (req, res, next) => {
    try {
      const exchangeId = Array.isArray(req.params.exchangeId)
        ? req.params.exchangeId[0]
        : req.params.exchangeId;

      const exchange = await updateExchange(exchangeId, req.body);
      res.status(200).json(exchange);
    } catch (error) {
      next(error)
    }
  },
);

router.delete(
  "/:exchangeId",
  validateParams(exchangeIdParamSchema),
  async (req, res, next) => {
    try {
      const exchangeId = Array.isArray(req.params.exchangeId)
        ? req.params.exchangeId[0]
        : req.params.exchangeId;

      await deleteExchange(exchangeId);
      res.status(204).send();
    } catch (error) {
      next(error)
    }
  },
);

router.post(
  "/:exchangeId/draw",
  validateParams(exchangeIdParamSchema),
  async (req, res, next) => {
    try {
      const exchangeId = Array.isArray(req.params.exchangeId)
        ? req.params.exchangeId[0]
        : req.params.exchangeId;

      const exchange = await drawExchange(exchangeId);
      res.status(200).json(exchange);
    } catch (error) {
      next(error)
    }
  },
);

router.post(
  "/:exchangeId/draw/cancel",
  validateParams(exchangeIdParamSchema),
  async (req, res, next) => {
    try {
      const exchangeId = Array.isArray(req.params.exchangeId)
        ? req.params.exchangeId[0]
        : req.params.exchangeId;

      const exchange = await cancelExchangeDraw(exchangeId);
      res.status(200).json(exchange);
    } catch (error) {
      next(error)
    }
  },
);

router.get(
  '/:exchangeId/exclusions',
  validateParams(exchangeIdParamSchema),
  async (req, res, next) => {
    try {
      const exchangeId = Array.isArray(req.params.exchangeId)
        ? req.params.exchangeId[0]
        : req.params.exchangeId

      const rules = await listExclusionRules(exchangeId)
      res.status(200).json(rules)
    } catch (error) {
      next(error)
    }
  },
)

router.post(
  '/:exchangeId/exclusions',
  validateParams(exchangeIdParamSchema),
  validateBody(createExclusionRuleInputSchema),
  async (req, res, next) => {
    try {
      const exchangeId = Array.isArray(req.params.exchangeId)
        ? req.params.exchangeId[0]
        : req.params.exchangeId

      const rule = await createExclusionRule(exchangeId, req.body)
      res.status(201).json(rule)
    } catch (error) {
      next(error)
    }
  },
)

router.delete(
  '/:exchangeId/exclusions/:ruleId',
  validateParams(exchangeAndExclusionRuleIdParamSchema),
  async (req, res, next) => {
    try {
      const exchangeId = Array.isArray(req.params.exchangeId)
        ? req.params.exchangeId[0]
        : req.params.exchangeId
      const ruleId = Array.isArray(req.params.ruleId)
        ? req.params.ruleId[0]
        : req.params.ruleId

      await deleteExclusionRule(exchangeId, ruleId)
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  },
)

export default router
