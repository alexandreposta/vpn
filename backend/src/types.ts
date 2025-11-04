import type { Instance } from '@aws-sdk/client-ec2';

export type AllowedAction = 'start' | 'stop' | 'reboot' | 'terminate';

export interface InstanceSummary {
  instanceId: string;
  name: string | null;
  state: Instance['State'];
  availabilityZone?: string;
  publicIp?: string;
  privateIp?: string;
  wireguardStatus: 'pending' | 'ready' | 'unknown';
  createdAt?: string;
  region: string;
}

export interface CreateInstancePayload {
  region: string;
  name?: string;
  clientPublicKey?: string;
}

export interface ConfigResponse {
  filename: string;
  region: string;
  instanceId: string;
  contentType: string;
  configBody: string;
  lastUpdated?: string;
  signedUrl?: string;
}
