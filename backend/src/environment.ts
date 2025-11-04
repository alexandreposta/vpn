import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  INSTANCE_TYPE: z.string().default('t4g.micro'),
  PROJECT_TAG: z.string().default('vpn-pwa'),
  OWNER_TAG: z.string().default('self'),
  S3_CONFIG_BUCKET: z.string(),
  ALLOWED_REGIONS: z
    .string()
    .transform((val) => val.split(',').map((region) => region.trim()).filter(Boolean)),
  DEFAULT_REGION: z.string().default('eu-west-3'),
  WIREGUARD_PORT: z.coerce.number().default(51820),
  AWS_ACCOUNT_ID: z.string().optional(),
  INSTANCE_PROFILE_ARN: z.string().optional()
});

export type EnvConfig = z.infer<typeof envSchema>;

export const getEnv = (): EnvConfig => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
};
