export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found.') {
    super(404, message)
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request.', details?: unknown) {
    super(400, message, details)
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized.') {
    super(401, message)
  }
}
