import { z } from 'zod';

const booleanish = z
  .string()
  .optional()
  .transform((value) => value !== 'false' && value !== '0');

const optIn = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3002),
  SWAGGER_ENABLED: booleanish,

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: optIn,

  DATABASE_URL: z.string().min(1),

  // These describe the tokens minted by be-identity-service, not this service's own address.
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),

  // This service only verifies, so it never receives a private key.
  JWT_PUBLIC_KEY_B64: z.string().min(1),
  JWT_PREVIOUS_PUBLIC_KEY_B64: z.string().optional(),
  JWT_KEY_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  // Blank values in a .env file should fall back to defaults rather than fail `min(1)`.
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));

  const result = envSchema.safeParse(cleaned);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
