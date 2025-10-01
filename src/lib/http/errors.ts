export class HttpError extends Error {
  constructor(
    public readonly http: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad Request', details?: unknown) {
    super(400, message, details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super(401, message, details);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(403, message, details);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not Found', details?: unknown) {
    super(404, message, details);
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflict', details?: unknown) {
    super(409, message, details);
  }
}

export class ValidationError extends HttpError {
  constructor(message = 'Validation Error', details?: unknown) {
    super(422, message, details);
  }
}

export class InternalServerError extends HttpError {
  constructor(message = 'Internal Server Error', details?: unknown) {
    super(500, message, details);
  }
}

export class NotImplementedError extends HttpError {
  constructor(message = 'Not Implemented', details?: unknown) {
    super(501, message, details);
  }
}
