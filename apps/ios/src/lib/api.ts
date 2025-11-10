import axios from 'axios';

export interface InstanceSummary {
  instanceId: string;
  name: string | null;
  state: { Name?: string };
  availabilityZone?: string;
  publicIp?: string;
  privateIp?: string;
  wireguardStatus: 'pending' | 'ready' | 'unknown';
  createdAt?: string;
  region: string;
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

export interface CreateInstancePayload {
  region: string;
  name?: string;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000
});

export const fetchRegions = async (): Promise<string[]> => {
  const { data } = await api.get<{ regions: string[] }>('/regions');
  return data.regions;
};

export const fetchInstances = async (region?: string): Promise<InstanceSummary[]> => {
  const { data } = await api.get<{ instances: InstanceSummary[] }>('/instances', {
    params: region ? { region } : undefined
  });
  return data.instances;
};

export const createInstance = async (payload: CreateInstancePayload) => {
  const { data } = await api.post('/instances', payload);
  return data.instance;
};

export const triggerInstanceAction = async (
  instanceId: string,
  action: 'start' | 'stop' | 'terminate' | 'reboot',
  region: string
) => {
  await api.post(`/instances/${instanceId}/actions`, { action }, { params: { region } });
};

export const fetchConfig = async (instanceId: string, region: string) => {
  const { data } = await api.get<ConfigResponse>(`/instances/${instanceId}/config`, {
    params: { region }
  });
  return data;
};

