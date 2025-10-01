import { z } from 'zod';

const logLevelSchema = z.enum(['error', 'warn', 'info', 'debug', 'none']);
const logFormatSchema = z.enum(['human', 'json']);

const configSchema = z.object({
  APP_NAME: z.string().default('antithesis'),
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: logLevelSchema.default('info'),
  LOG_FORMAT: logFormatSchema.default(process.env.NODE_ENV === 'production' ? 'json' : 'human'),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  return configSchema.parse(process.env);
}

export const config: Config = loadConfig();
