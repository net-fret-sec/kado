import { Router } from 'express'
import type { Request } from 'express'
import {
  createParticipantInputSchema,
  exchangeIdParamSchema,
} from '@kado/shared'
import { validateBody, validateParams } from '../middleware/validate'
import {
  createParticipant,
  getParticipantsByExchangeId,
} from '../services/participant.service'

const router = Router()

router.get(
  '/:exchangeId/participants',
  validateParams(exchangeIdParamSchema),
  async (req: Request<{ exchangeId: string }>, res, next) => {
    try {
      const participants = await getParticipantsByExchangeId(req.params.exchangeId)
      res.status(200).json(participants)
    } catch (error) {
      next(error)
    }
  },
)

router.post(
  '/:exchangeId/participants',
  validateParams(exchangeIdParamSchema),
  validateBody(createParticipantInputSchema),
  async (
    req: Request<{ exchangeId: string }>,
    res,
    next,
  ) => {
    try {
      const result = await createParticipant(req.params.exchangeId, req.body)
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  },
)

export default router
