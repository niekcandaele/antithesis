import { Request, Response } from 'express';

import { logger } from '../logger.js';
import { apiResponse } from './apiResponse.js';
import * as errors from './errors.js';
import { middleware, MiddlewareTypes } from './middleware.js';

const log = logger('errorHandler');

/**
 * Detect if the request expects an HTML response (web browser) vs JSON (API)
 */
function isWebRequest(req: Request): boolean {
  // Check Accept header - browsers typically include text/html
  const accept = req.headers.accept ?? '';
  if (accept.includes('text/html')) {
    return true;
  }

  // Check if it's an API route
  if (req.path.startsWith('/api/')) {
    return false;
  }

  // Default: treat as web request for better UX
  return true;
}

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

    // Determine response type based on request
    if (isWebRequest(req)) {
      // Render HTML error page for browser requests
      // res.render() automatically ends the response, no need to call res.end()
      res.status(status).render('pages/error', {
        status,
        message: parsedError.message,
        details: process.env.NODE_ENV === 'development' ? (originalError.stack ?? null) : null,
        user: (res.locals.user as unknown) ?? null,
      });
      return;
    } else {
      // Return JSON for API requests
      res.status(status).json(apiResponse({}, { error: parsedError }));
      res.end();
      return;
    }
  },
});
