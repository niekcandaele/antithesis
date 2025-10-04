import { type NextFunction, type Request, type Response } from 'express';
import { middleware, MiddlewareTypes } from '../middleware.js';
import { userRepository, type UserEntity } from '../../../db/user.repository.js';

// Extend Express Request and Session types
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    currentTenantId?: string;
    oauthState?: string;
    returnTo?: string;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserEntity | null;
    }
  }
}

/**
 * Populate req.user from session if authenticated
 * Runs on all requests, sets user to null if no session
 */
export const populateUser = middleware({
  name: 'populateUser',
  type: MiddlewareTypes.BEFORE,
  handler: async (req: Request, _res: Response, next: NextFunction) => {
    if (req.session && req.session.userId) {
      try {
        const user = await userRepository.findById(req.session.userId);
        req.user = user ?? null;
      } catch (error) {
        // Log error but don't fail request
        // eslint-disable-next-line no-console
        console.error('Failed to populate user from session:', error);
        req.user = null;
      }
    } else {
      req.user = null;
    }
    next();
  },
});

/**
 * Protect routes - requires authentication
 * Redirects to login if no valid session
 */
export const requireAuth = middleware({
  name: 'requireAuth',
  type: MiddlewareTypes.BEFORE,
  handler: (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !req.session.userId || !req.user) {
      // Save the original URL to redirect back after login
      if (req.session) {
        req.session.returnTo = req.originalUrl;
      }
      res.redirect('/auth/login');
      return;
    }
    next();
  },
});
