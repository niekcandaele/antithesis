/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unnecessary-type-conversion */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import winston from 'winston';
import { config } from './config.js';
import type { TransformableInfo } from 'logform';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Human-readable format for development
const humanFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf((info: TransformableInfo) => {
    const level = String(info.level ?? '');
    const message = String(info.message ?? '');
    const ts = String(info.timestamp ?? '');
    const namespace = info.namespace as string | undefined;
    const stack = info.stack as string | undefined;

    const ns = namespace ? `[${namespace}]` : '';
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { level: _, message: __, timestamp: ___, namespace: ____, stack: _____, ...meta } = info;
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';

    if (stack) {
      return `${ts} ${level} ${ns}: ${message}\n${stack}${metaStr}`;
    }

    return `${ts} ${level} ${ns}: ${message}${metaStr}`;
  }),
);

// JSON format for production
const jsonFormat = combine(timestamp(), errors({ stack: true }), json());

const mainLogger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: config.LOG_FORMAT === 'json' ? jsonFormat : humanFormat,
  transports: [new winston.transports.Console()],
  silent: config.LOG_LEVEL === 'none',
});

export function logger(namespace?: string, meta?: Record<string, unknown>): winston.Logger {
  return mainLogger.child({ namespace, ...meta });
}

export const rootLogger = mainLogger;
