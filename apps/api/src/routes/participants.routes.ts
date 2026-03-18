import { Router } from 'express'
import {
  createParticipantInputSchema,
  exchangeIdParamSchema,
} from '@mon-projet/shared'
import { validateBody, validateParams } from '../middleware/validate'
import { createParticipant } from '../services/participant.service'

const router = Router()

router.post(
  '/:exchangeId/participants',
  validateParams(exchangeIdParamSchema),
  validateBody(createParticipantInputSchema),
  async (req, res, next) => {
    try {
      const result = await createParticipant(req.params.exchangeId, req.body)
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  },
)

export default router
