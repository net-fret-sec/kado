import { Router } from 'express'
import type { Request } from 'express'
import {
  createParticipantInputSchema,
  exchangeIdParamSchema,
  exchangeAndParticipantIdParamSchema,
  updateParticipantInputSchema,
  regenerateParticipantAccessInputSchema,
} from '@kado/shared'
import { validateBody, validateParams } from '../middleware/validate'
import {
  createParticipant,
  getParticipantsByExchangeId,
  getParticipantById,
  updateParticipant,
  deleteParticipant,
  regenerateParticipantAccess,
} from '../services/participant.service'
import { requireAdminSession } from '../middleware/require-admin-session'

const router = Router()

router.get(
  '/:exchangeId/participants',
  validateParams(exchangeIdParamSchema),
  requireAdminSession,
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
  requireAdminSession,
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

router.get(
  '/:exchangeId/participants/:participantId',
  validateParams(exchangeAndParticipantIdParamSchema),
  requireAdminSession,
  async (req: Request<{ exchangeId: string; participantId: string }>, res, next) => {
    try {
      const participant = await getParticipantById(req.params.participantId)
      res.status(200).json(participant)
    } catch (error) {
      next(error)
    }
  },
)

router.put(
  '/:exchangeId/participants/:participantId',
  validateParams(exchangeAndParticipantIdParamSchema),
  validateBody(updateParticipantInputSchema),
  requireAdminSession,
  async (req: Request<{ exchangeId: string; participantId: string }>, res, next) => {
    try {
      const participant = await updateParticipant(req.params.participantId, req.body)
      res.status(200).json(participant)
    } catch (error) {
      next(error)
    }
  },
)

router.delete(
  '/:exchangeId/participants/:participantId',
  validateParams(exchangeAndParticipantIdParamSchema),
  requireAdminSession,
  async (req: Request<{ exchangeId: string; participantId: string }>, res, next) => {
    try {
      await deleteParticipant(req.params.participantId)
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  },
)

router.post(
  '/:exchangeId/participants/:participantId/access/regenerate',
  validateParams(exchangeAndParticipantIdParamSchema),
  validateBody(regenerateParticipantAccessInputSchema),
  requireAdminSession,
  async (
    req: Request<{ exchangeId: string; participantId: string }, any, { revokeExisting?: boolean }>,
    res,
    next,
  ) => {
    try {
      const result = await regenerateParticipantAccess(
        req.params.participantId,
        req.body?.revokeExisting ?? true,
      )
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  },
)

export default router
