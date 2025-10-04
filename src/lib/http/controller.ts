import { type Application } from 'express';

import { type AnyEndpoint, type Endpoint, endpointToExpressHandler } from './endpoint.js';
import { Middleware, MiddlewareTypes } from './middleware.js';

interface ControllerOptions {
  name?: string;
  description?: string;
  middlewares: Middleware[];
  endpoints: Endpoint[];
}

export class Controller {
  constructor(private options: ControllerOptions) {}

  /** Add a description to the controller */
  description(description: typeof this.options.description) {
    this.options.description = description;
    return this;
  }

  /** Add an endpoint to the controller */
  endpoint(endpoint: AnyEndpoint) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.options.endpoints.push(endpoint);
    return this;
  }

  /** Add an array of endpoints to the controller */
  endpoints(endpoints: AnyEndpoint[]) {
    this.options.endpoints.push(...endpoints);
    return this;
  }

  /** Add a middleware to the controller */
  middleware(middleware: Middleware) {
    this.options.middlewares.push(middleware);
    return this;
  }

  /** Add an array of middlewares to the controller */
  middlewares(middlewares: Middleware[]) {
    this.options.middlewares.push(...middlewares);
    return this;
  }

  getEndpoints() {
    return this.options.endpoints;
  }

  getMiddlewares() {
    return this.options.middlewares;
  }

  getName() {
    return this.options.name;
  }

  getDescription() {
    return this.options.description;
  }
}

export const controller = (name: string) =>
  new Controller({
    name,
    endpoints: [],
    middlewares: [],
  });

/**
 * Join controller base path with endpoint path
 * Handles leading/trailing slashes correctly
 */
function joinPaths(basePath: string, endpointPath: string): string {
  // Root controller - no prefix
  if (basePath === '/' || basePath === '') {
    return endpointPath;
  }

  // Normalize paths - ensure leading slash
  const base = basePath.startsWith('/') ? basePath : `/${basePath}`;
  const endpoint = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;

  // Join and remove double slashes
  return `${base}${endpoint}`.replace(/\/+/g, '/');
}

export const bindControllerToApp = (_controller: Controller, app: Application) => {
  const controllerBeforeMiddlewares = _controller
    .getMiddlewares()
    .filter((m) => m.type === MiddlewareTypes.BEFORE);
  const controllerAfterMiddlewares = _controller
    .getMiddlewares()
    .filter((m) => m.type === MiddlewareTypes.AFTER);

  _controller.getEndpoints().forEach((endpoint) => {
    const fullPath = joinPaths(_controller.getName() ?? '/', endpoint.getPath());

    app[endpoint.getMethod()](
      fullPath,
      // Controller before middleware
      ...controllerBeforeMiddlewares.map((m) => m.handler),

      // Endpoint before middleware
      ...(endpoint.getMiddlewares() ?? [])
        .filter((m) => m.type === MiddlewareTypes.BEFORE)
        .map((m) => m.handler),

      // Endpoint handler
      endpointToExpressHandler(endpoint),

      // Endpoint after middleware
      ...(endpoint.getMiddlewares() ?? [])
        .filter((m) => m.type === MiddlewareTypes.AFTER)
        .map((m) => m.handler),

      // Controller after middleware
      ...controllerAfterMiddlewares.map((m) => m.handler),
    );
  });
};
