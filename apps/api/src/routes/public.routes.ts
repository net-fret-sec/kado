import { Router } from 'express'
import type { Request } from 'express'
import { z } from 'zod'
import { updateParticipantInputSchema } from '@kado/shared'
import {
  getParticipantSelfViewByToken,
  updateParticipantSelfByToken,
} from '../services/participant.service'
import { validateBody } from '../middleware/validate'

const router = Router()

const tokenParamSchema = z.object({ token: z.string().min(1) })

router.get('/p/:token', async (req: Request<{ token: string }>, res, next) => {
  try {
    const parsed = tokenParamSchema.parse(req.params)
    const view = await getParticipantSelfViewByToken(parsed.token)
    res.status(200).json(view)
  } catch (error) {
    next(error)
  }
})

router.put(
  '/p/:token',
  validateBody(updateParticipantInputSchema),
  async (req: Request<{ token: string }>, res, next) => {
    try {
      const parsed = tokenParamSchema.parse(req.params)
      const view = await updateParticipantSelfByToken(parsed.token, req.body)
      res.status(200).json(view)
    } catch (error) {
      next(error)
    }
  },
)

export default router
