import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import healthRoutes from './routes/health.routes'
import exchangesRoutes from './routes/exchanges.routes'
import participantsRoutes from './routes/participants.routes'
import { errorHandler } from './middleware/error-handler'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(cors())
  app.use(morgan('dev'))
  app.use(express.json())

  app.use('/health', healthRoutes)
  app.use('/api/exchanges', exchangesRoutes)
  app.use('/api/exchanges', participantsRoutes)

  app.use(errorHandler)

  return app
}
