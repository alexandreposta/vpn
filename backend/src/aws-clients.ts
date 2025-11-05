import { EC2Client } from '@aws-sdk/client-ec2';
import { S3Client } from '@aws-sdk/client-s3';

import type { EnvConfig } from './environment.js';

interface Clients {
  ec2: EC2Client;
  s3: S3Client;
}

export const buildClients = (region: string): Clients => ({
  ec2: new EC2Client({ region }),
  s3: new S3Client({ region })
});

export const deriveRegion = (env: EnvConfig, region?: string): string => {
  if (region && env.ALLOWED_REGIONS.includes(region)) {
    return region;
  }
  return env.DEFAULT_REGION;
};
