import { createServer, Server } from 'node:http';

import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application } from 'express';

import { config } from '../config.js';
import { logger } from '../logger.js';
import { bindControllerToApp, Controller } from './controller.js';
import * as errors from './errors.js';
import { errorHandlerMiddleware } from './errorHandler.js';
import { Middleware, MiddlewareTypes } from './middleware.js';
import { Oas, OASInfo } from './oas.js';
import { getServerContextMiddleware } from './serverContext.js';

interface RoutingOptions {
  controllers?: Controller[];
  middlewares?: Middleware[];
}

interface IHTTPOptions {
  port?: number;
  allowedOrigins?: string[];
  bypassAllowedOrigins?: boolean;
  trustProxy?: boolean;
  oasInfo?: OASInfo;
  bodyParserOptions?: bodyParser.OptionsJson;
}

export class HTTP {
  private app: Application;
  private httpServer: Server;
  private logger;
  private oas: Oas;

  constructor(
    private options: RoutingOptions = {},
    private httpOptions: IHTTPOptions = {},
  ) {
    this.logger = logger('http');

    this.oas = new Oas(httpOptions.oasInfo);

    // Apply defaults
    this.httpOptions = {
      trustProxy: true,
      ...this.httpOptions,
    };

    this.app = express();
    this.httpServer = createServer(this.app);

    this.app.set('trust proxy', this.httpOptions.trustProxy);
    this.app.set('view engine', 'ejs');
    this.app.set('views', config.VIEWS_DIR);
    this.app.use(express.static('public'));

    // PostCSS middleware for development (on-demand CSS compilation)
    if (process.env.NODE_ENV !== 'production') {
      let postcssHandler: ((req: unknown, res: unknown, next: () => void) => void) | null = null;

      // Lazy-load PostCSS middleware to avoid race conditions
      this.app.use('/css/main.css', (req, res, next) => {
        if (postcssHandler != null) {
          postcssHandler(req, res, next);
        } else {
          next();
        }
      });

      // Load PostCSS middleware asynchronously
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - These packages lack proper type definitions
      void import('postcss-middleware').then(({ default: postcssMiddleware }) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - These packages lack proper type definitions
        void import('tailwindcss').then(({ default: tailwindcss }) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore - These packages lack proper type definitions
          void import('autoprefixer').then(({ default: autoprefixer }) => {
            postcssHandler = postcssMiddleware({
              src: () => 'src/styles/main.css',
              plugins: [tailwindcss, autoprefixer],
            });
          });
        });
      });
    }

    this.app.use(bodyParser.json(this.httpOptions.bodyParserOptions));
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(
      cors({
        credentials: true,
        origin: (
          origin: string | undefined,
          callback: (err: Error | null, allow?: boolean) => void,
        ) => {
          if (origin == null || origin === 'null') {
            callback(null, true);
            return;
          }
          const allowedOrigins = this.httpOptions.allowedOrigins ?? [];
          if (
            !origin ||
            allowedOrigins.includes(origin) ||
            this.httpOptions.bypassAllowedOrigins === true
          ) {
            callback(null, true);
            return;
          }
          this.logger.warn(`Origin ${origin} not allowed`);
          callback(new errors.BadRequestError('Not allowed by CORS'));
        },
      }),
    );
    this.app.use(cookieParser());

    // Set default middlewares
    this.options.middlewares = [
      getServerContextMiddleware({
        oas: this.oasInstance,
      }),
      ...(this.options.middlewares ?? []),
      errorHandlerMiddleware,
    ];

    // Set default controllers
    this.options.controllers = this.options.controllers ?? [];

    // run all global before middlewares
    this.options.middlewares
      .filter((m) => m.type === MiddlewareTypes.BEFORE)
      .forEach((middleware) => {
        this.app.use(middleware.handler);
      });

    // Bind all controllers
    this.options.controllers.forEach((controller) => {
      bindControllerToApp(controller, this.app);
      this.oas.addController(controller);
    });

    // run all global after middlewares
    this.options.middlewares
      .filter((m) => m.type === MiddlewareTypes.AFTER)
      .forEach((middleware) => {
        this.app.use(middleware.handler);
      });
  }

  get expressInstance() {
    return this.app;
  }

  get oasInstance() {
    return this.oas;
  }

  get server() {
    return this.httpServer;
  }

  start() {
    this.httpServer = this.httpServer.listen(this.httpOptions.port, () => {
      this.logger.info(`HTTP server listening on port ${String(this.httpOptions.port)}`);
    });
  }

  stop() {
    this.httpServer.close();
    this.logger.info('HTTP server stopped');
  }
}
