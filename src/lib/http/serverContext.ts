import { AsyncLocalStorage } from 'node:async_hooks';
import { NextFunction, Request, Response } from 'express';

import { middleware, MiddlewareTypes } from './middleware.js';
import { Oas } from './oas.js';

export interface ServerContext {
  oas: Oas;
  tenantId?: string;
  userId?: string;
}

class ServerContextManager {
  private asyncLocalStorage = new AsyncLocalStorage<ServerContext>();

  runWithContext<T>(context: ServerContext, fn: () => T): T {
    return this.asyncLocalStorage.run(context, fn);
  }

  getContext(): ServerContext {
    const context = this.asyncLocalStorage.getStore();
    if (context == null) {
      throw new Error('No server context found, was the getServerContextMiddleware used?');
    }
    return context;
  }
}

// Export contextManager for creating nested contexts (e.g., adding tenantId)
export const contextManager = new ServerContextManager();

export const getServerContextMiddleware = (serverContext: ServerContext) =>
  middleware({
    name: 'ServerContext',
    type: MiddlewareTypes.BEFORE,
    handler(_req: Request, _res: Response, next: NextFunction) {
      // Create a fresh context for each request to prevent context leakage
      const requestContext = { ...serverContext };
      contextManager.runWithContext(requestContext, () => {
        next();
      });
    },
  });

export const getServerContext = (): ServerContext => {
  return contextManager.getContext();
};
