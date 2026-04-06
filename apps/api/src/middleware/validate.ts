import type { NextFunction, Request, Response } from 'express'
import type { ZodTypeAny } from 'zod'
import { ZodError } from 'zod'
import { BadRequestError } from '../lib/http-errors'

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body)
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new BadRequestError('Invalid request body.', {
            code: 'INVALID_REQUEST_BODY',
            ...error.flatten(),
          }),
        )
        return
      }
      next(error)
    }
  }
}

export function validateParams(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as Request['params']
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new BadRequestError('Invalid route parameters.', {
            code: 'INVALID_ROUTE_PARAMETERS',
            ...error.flatten(),
          }),
        )
        return
      }
      next(error)
    }
  }
}
