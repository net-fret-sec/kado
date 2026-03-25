import { Router } from 'express'
import { createExchangeInputSchema } from '@kado/shared'
import { validateBody } from '../middleware/validate'
import { createExchange } from '../services/exchange.service'

const router = Router()

router.post('/', validateBody(createExchangeInputSchema), async (req, res, next) => {
  try {
    const result = await createExchange(req.body)
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
})

export default router
