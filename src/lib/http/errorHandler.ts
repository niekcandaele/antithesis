import { Request, Response } from 'express';

import { logger } from '../logger.js';
import { apiResponse } from './apiResponse.js';
import * as errors from './errors.js';
import { middleware, MiddlewareTypes } from './middleware.js';

const log = logger('errorHandler');

export const errorHandlerMiddleware = middleware({
  name: 'ErrorHandler',
  type: MiddlewareTypes.AFTER,
  handler(originalError: Error | errors.HttpError, req: Request, res: Response) {
    let status = 500;
    let parsedError = new errors.InternalServerError();

    if (originalError.name === 'UniqueViolationError') {
      status = 409;
      parsedError = new errors.ConflictError(parsedError.message);
    }

    if (originalError instanceof errors.HttpError) {
      status = originalError.http;
      parsedError = originalError;
    }

    if (status >= 500) {
      log.error(`🔴 FAIL ${req.method} ${req.originalUrl}`, {
        error: parsedError.message,
        originalError: originalError.message,
        stack: originalError.stack,
      });
    } else {
      log.warn(`⚠️ FAIL ${req.method} ${req.originalUrl}`, {
        error: parsedError.message,
      });
    }

    res.status(status).json(apiResponse({}, { error: parsedError }));
    return res.end();
  },
});
