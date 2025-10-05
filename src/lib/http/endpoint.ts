import type { NextFunction, Request, Response } from 'express';
import z, { ZodObject, ZodRawShape, ZodSchema, ZodString } from 'zod';

import * as errors from './errors.js';
import { Middleware } from './middleware.js';
import { type EndpointOasInfo } from './oas.js';

export const methods = [
  'get',
  'put',
  'post',
  'delete',
  'head',
  'options',
  'patch',
  'trace',
] as const;
export type Method = (typeof methods)[number];

type ExtractRouteParams<Path extends string> = string extends Path
  ? Record<string, ZodString>
  : // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Path extends `${infer _Start}:${infer Param}/${infer Rest}`
    ? // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
      { [K in Param | keyof ExtractRouteParams<Rest>]: ZodString }
    : // eslint-disable-next-line @typescript-eslint/no-unused-vars
      Path extends `${infer _Start}:${infer Param}`
      ? Record<Param, ZodString>
      : ZodRawShape;

export type InputValidationSchema<Path extends string> = ZodObject<{
  params?: ZodObject<ExtractRouteParams<Path>>;
  query?: ZodObject<Record<string, ZodSchema>>;
  body?: ZodSchema;
}>;

export type ResponseValidationSchema = ZodSchema;

export interface EndpointOptions<
  Path extends string,
  InputsSchema extends InputValidationSchema<Path> = InputValidationSchema<Path>,
  OutputSchema extends ResponseValidationSchema = ResponseValidationSchema,
> {
  method: Method;
  path: Path;
  name?: string;
  description?: string;
  oasInfo?: Partial<EndpointOasInfo>;
  handler?: (
    inputs: z.output<InputsSchema>,
    req: Request,
    res: Response,
  ) => Promise<z.input<OutputSchema>>;
  inputValidationSchema?: InputsSchema;
  responseValidationSchema?: OutputSchema;
  responseContentType: string;
  middlewares?: Middleware[];
  hideFromOpenAPI?: boolean;
  viewTemplate?: string;
  viewDataHandler?: (
    inputs: z.output<InputsSchema>,
    req: Request,
    res: Response,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

export class Endpoint<
  Path extends string = string,
  InputsSchema extends InputValidationSchema<Path> = InputValidationSchema<Path>,
  OutputSchema extends ResponseValidationSchema = ResponseValidationSchema,
> {
  constructor(private options: EndpointOptions<Path, InputsSchema, OutputSchema>) {}

  /** Add a description to the endpoint */
  description(description: (typeof this.options)['description']) {
    this.options.description = description;
    return this;
  }

  /** Name the endpoint */
  name(name: (typeof this.options)['name']) {
    this.options.name = name;
    return this;
  }

  /** Add openapi properties to the endpoint, which will be reflected in the openapi spec */
  oas(oasInfo: (typeof this.options)['oasInfo']) {
    this.options.oasInfo = oasInfo;
    return this;
  }

  /** Specify a zod input schema for the endpoint.
   * Must be a zod object on which the following properties are allowed: params, query, body.
   *
   * @example
   * ```ts
   * ...
   * .input(z.object({
   *   query: z.object({
   *     name: z.string(),
   *     age: z.number().optional()
   *   })
   * }))
   * ```
   * */
  input<NewInputsSchema extends InputValidationSchema<Path>>(
    inputValidationSchema: NewInputsSchema,
  ) {
    return new Endpoint<Path, NewInputsSchema, OutputSchema>({
      ...this.options,
      inputValidationSchema,
    });
  }

  /** Specify a zod output schema for the endpoint. Corresponds to the body of the HTTP response.
   * @example
   * ```ts
   * ...
   * .output(zApiResponse(z.object({
   *   greeting: z.string()
   * })))
   * ```
   * */
  response<NewOutputSchema extends OutputSchema>(responseValidationSchema: NewOutputSchema) {
    return new Endpoint<Path, InputsSchema, NewOutputSchema>({
      ...this.options,
      responseValidationSchema,
    });
  }

  /**
   * Specify the response content type. Defaults to `application/json`.
   * @example
   * ```ts
   *...
   *.responseContentType('text/plain')
   * ```
   * */
  responseContentType(contentType: string) {
    this.options.responseContentType = contentType;
    return this;
  }

  /** Define the handler of the endpoint. Should be an async function.
   * The return type should correspond to the response schema.
   * @example
   * ```ts
   * ...
   * .handler(async (input, req, res) => {
   *   return {
   *     greeting: `Hello ${input.query.name ?? 'everybody}!`
   *   }
   * })
   * ```
   * */
  handler(
    handler: (
      inputs: z.output<InputsSchema>,
      req: Request,
      res: Response,
    ) => Promise<z.input<OutputSchema>>,
  ) {
    this.options.handler = handler;
    return this;
  }

  /** Add an array of middlewares to the endpoint */
  middlewares(middlewares: Middleware[]) {
    this.options.middlewares = [...(this.options.middlewares ?? []), ...middlewares];
    return this;
  }

  /** Add a middleware to the endpoint */
  middleware(middleware: Middleware) {
    this.options.middlewares = [...(this.options.middlewares ?? []), middleware];
    return this;
  }

  /** Hide this endpoint from the OpenAPI specification */
  hideFromOpenAPI() {
    this.options.hideFromOpenAPI = true;
    return this;
  }

  /**
   * Render a view template using EJS.
   * Automatically includes global context in all views. The data handler can return synchronous
   * or asynchronous data, which will be merged with the global context before rendering.
   *
   * ## Global Context Variables
   *
   * All views automatically receive these variables:
   * - `route`: Current request path (e.g., '/dashboard')
   * - `config`: Application configuration object (all environment variables from config.ts)
   * - `flash`: Flash message object (currently a placeholder for future implementation)
   * - `user`: Authenticated user object from request, or null if not authenticated
   *
   * ## Data Handler
   *
   * The data handler receives:
   * - `inputs`: Validated inputs from the request (params, query, body)
   * - `req`: Express Request object
   * - `res`: Express Response object
   *
   * It should return an object with template variables. These will be merged with the global context.
   * The data handler can be synchronous or asynchronous (return a Promise).
   *
   * @param template - Path to EJS template relative to views directory (e.g., 'pages/dashboard')
   * @param dataHandler - Function that returns data to pass to the template
   * @returns The endpoint instance for method chaining
   *
   * @example Basic usage
   * ```ts
   * get('/dashboard', 'getDashboard')
   *   .renderView('pages/dashboard', () => {
   *     return {
   *       title: 'Dashboard',
   *       stats: { users: 100, posts: 50 }
   *     };
   *   });
   * ```
   *
   * @example Async data handler
   * ```ts
   * get('/profile/:id', 'getProfile')
   *   .input(z.object({
   *     params: z.object({ id: z.string() })
   *   }))
   *   .renderView('pages/profile', async ({ params }) => {
   *     const user = await getUserById(params.id);
   *     return {
   *       title: `Profile - ${user.name}`,
   *       user
   *     };
   *   });
   * ```
   *
   * @example Using global context in templates
   * ```ejs
   * <h1>Welcome to <%= config.APP_NAME %></h1>
   * <p>Current route: <%= route %></p>
   * <% if (user) { %>
   *   <p>Hello, <%= user.name %>!</p>
   * <% } %>
   * <p><%= title %></p>
   * ```
   */
  renderView<ViewData extends Record<string, unknown>>(
    template: string,
    dataHandler: (
      inputs: z.output<InputsSchema>,
      req: Request,
      res: Response,
    ) => Promise<ViewData> | ViewData,
  ) {
    this.options.viewTemplate = template;
    this.options.viewDataHandler = dataHandler;
    this.options.responseContentType = 'text/html';
    return this;
  }

  getName() {
    return this.options.name;
  }

  getHideFromOpenAPI() {
    return this.options.hideFromOpenAPI ?? false;
  }

  getDescription() {
    return this.options.description;
  }

  getMiddlewares() {
    return this.options.middlewares;
  }

  getHandler() {
    return this.options.handler;
  }

  getOasInfo() {
    return this.options.oasInfo;
  }

  getMethod() {
    return this.options.method;
  }

  getPath() {
    return this.options.path;
  }

  getInputValidationSchema() {
    return this.options.inputValidationSchema;
  }

  getResponseValidationSchema() {
    return this.options.responseValidationSchema;
  }

  getResponseContentType() {
    return this.options.responseContentType;
  }

  getViewTemplate() {
    return this.options.viewTemplate;
  }

  getViewDataHandler() {
    return this.options.viewDataHandler;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEndpoint = Endpoint<any, any>;

/** Define a new endpoint */
export const endpoint = <Path extends string>(method: Method, path: Path, name?: string) =>
  new Endpoint<Path>({
    name,
    method,
    path,
    responseContentType: 'application/json',
  });

/** Define a new GET endpoint */
export const get = <Path extends string>(path: Path, name?: string) => endpoint('get', path, name);

/** Define a new PUT endpoint */
export const put = <Path extends string>(path: Path, name?: string) => endpoint('put', path, name);

/** Define a new POST endpoint */
export const post = <Path extends string>(path: Path, name?: string) =>
  endpoint('post', path, name);

/** Define a new DELETE endpoint */
export const del = <Path extends string>(path: Path, name?: string) =>
  endpoint('delete', path, name);

export const endpointToExpressHandler = (_endpoint: AnyEndpoint) => {
  const endpointHandler = (req: Request, res: Response, next: NextFunction) => {
    let postValidationInputs: z.output<
      NonNullable<ReturnType<typeof _endpoint.getInputValidationSchema>>
    >;

    // Input validation
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      postValidationInputs = _endpoint.getInputValidationSchema()?.parse(req);
    } catch (error: unknown) {
      const e = error as z.ZodError;
      next(new errors.ValidationError(e.message, e.issues));
      return;
    }

    // Check if this is a view rendering endpoint
    const viewTemplate = _endpoint.getViewTemplate();
    const viewDataHandler = _endpoint.getViewDataHandler();

    if (viewTemplate != null && viewDataHandler != null) {
      // Handle view rendering
      Promise.resolve(viewDataHandler(postValidationInputs, req, res))
        .then(async (viewData) => {
          // Import config dynamically to avoid circular dependencies
          const { config } = (await import('../config.js')) as { config: Record<string, unknown> };

          // Fetch user tenants for tenant selector
          const userTenants: { id: string; name: string; slug: string }[] = [];
          const reqWithSession = req as {
            session?: { userId?: string; currentTenantId?: string };
            user?: { id: string };
          };

          if (reqWithSession.session?.userId && reqWithSession.user) {
            try {
              const { userTenantRepository } = (await import(
                '../../db/user-tenant.repository.js'
              )) as {
                userTenantRepository: { findTenantsForUser: (userId: string) => Promise<string[]> };
              };
              const { tenantRepository } = (await import('../../db/tenant.repository.js')) as {
                tenantRepository: {
                  findById: (
                    id: string,
                  ) => Promise<{ id: string; name: string; slug: string } | undefined>;
                };
              };

              const tenantIds = await userTenantRepository.findTenantsForUser(
                reqWithSession.user.id,
              );

              for (const tenantId of tenantIds) {
                const tenant = await tenantRepository.findById(tenantId);
                if (tenant) {
                  userTenants.push({
                    id: tenant.id,
                    name: tenant.name,
                    slug: tenant.slug,
                  });
                }
              }
            } catch (error) {
              // Silently fail - tenant selector just won't show
              // eslint-disable-next-line no-console
              console.error('Failed to fetch user tenants for view:', error);
            }
          }

          // Merge view data with global context
          const mergedContext = {
            route: req.path,
            config,
            flash: {}, // Placeholder for future flash message integration
            user: (req as { user?: unknown }).user ?? null,
            userTenants,
            currentTenantId: reqWithSession.session?.currentTenantId ?? null,
            ...viewData,
          };

          res.render(viewTemplate, mergedContext);
        })
        .catch((e: unknown) => {
          next(e);
        });
      return;
    }

    if (_endpoint.getHandler() == null) {
      next(new errors.NotImplementedError());
      return;
    }

    _endpoint
      .getHandler()?.(postValidationInputs, req, res)
      .then((responseObj) => {
        if (!res.headersSent) {
          // Output validation
          let postOutputValidationResponseObj: z.output<
            NonNullable<ReturnType<typeof _endpoint.getResponseValidationSchema>>
          >;

          const responseValidationSchema = _endpoint.getResponseValidationSchema();
          if (responseValidationSchema != null) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              postOutputValidationResponseObj = responseValidationSchema.parse(responseObj);
            } catch (error: unknown) {
              const e = error as z.ZodError;
              next(new errors.ValidationError(e.message, e.issues));
              return;
            }
          } else {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            postOutputValidationResponseObj = responseObj;
          }

          res.header('content-type', _endpoint.getResponseContentType());
          res.send(postOutputValidationResponseObj);
        }
      })
      .catch((e: unknown) => {
        next(e);
      });
  };

  return endpointHandler;
};
