import { z } from 'zod';

const configSchema = z.object({
  APP_NAME: z.string().default('antithesis'),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  return configSchema.parse(process.env);
}

export const config: Config = loadConfig();
