import { AsyncLocalStorage } from 'node:async_hooks';
import { NextFunction, Request, Response } from 'express';

import { middleware, MiddlewareTypes } from './middleware.js';
import { Oas } from './oas.js';

export interface ServerContext {
  oas: Oas;
  tenantId?: string;
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

  updateContext(updates: Partial<ServerContext>): void {
    const context = this.getContext();
    Object.assign(context, updates);
  }
}

const contextManager = new ServerContextManager();

export const getServerContextMiddleware = (serverContext: ServerContext) =>
  middleware({
    name: 'ServerContext',
    type: MiddlewareTypes.BEFORE,
    handler(_req: Request, _res: Response, next: NextFunction) {
      contextManager.runWithContext(serverContext, () => {
        next();
      });
    },
  });

export const getServerContext = (): ServerContext => {
  return contextManager.getContext();
};

export const setTenantId = (tenantId: string): void => {
  contextManager.updateContext({ tenantId });
};
