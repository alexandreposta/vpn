import type { Instance } from '@aws-sdk/client-ec2';
import {
  CreateTagsCommand,
  DescribeInstancesCommand,
  RebootInstancesCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  Tag,
  TerminateInstancesCommand
} from '@aws-sdk/client-ec2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';

import { buildClients, deriveRegion } from './aws-clients';
import { type EnvConfig, getEnv } from './environment';
import type { AllowedAction, ConfigResponse, CreateInstancePayload, InstanceSummary } from './types';
import { buildUserData } from './wireguard';

let cachedEnv: EnvConfig | null = null;

const env = () => {
  if (!cachedEnv) {
    cachedEnv = getEnv();
  }
  return cachedEnv;
};

const jsonResponse = (statusCode: number, payload: unknown) => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*'
  },
  body: JSON.stringify(payload)
});

const parseBody = <T>(body: string | undefined, schema: z.ZodSchema<T>): T => {
  if (!body) {
    throw new Error('Body is required');
  }
  const parsed = schema.parse(JSON.parse(body));
  return parsed;
};

const mapInstance = (instance: Instance, region: string): InstanceSummary => {
  const tags = instance.Tags ?? [];
  const nameTag = tags.find((tag: Tag) => tag.Key === 'Name');
  const wireguardStatus = tags.find((tag: Tag) => tag.Key === 'WireGuardStatus')?.Value;
  const createdAt = tags.find((tag: Tag) => tag.Key === 'CreatedAt')?.Value;
  return {
    instanceId: instance.InstanceId,
    name: nameTag?.Value ?? null,
    state: instance.State,
    availabilityZone: instance.Placement?.AvailabilityZone,
    publicIp: instance.PublicIpAddress,
    privateIp: instance.PrivateIpAddress,
    wireguardStatus: (wireguardStatus as InstanceSummary['wireguardStatus']) ?? 'unknown',
    createdAt,
    region
  };
};

const bodySchema = z.object({
  region: z.string().optional(),
  name: z.string().optional()
});

const actionSchema = z.object({
  action: z.enum(['start', 'stop', 'reboot', 'terminate'])
});

const extractInstanceId = (path: string): string | null => {
  const match = path.match(/\/instances\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const performAction = async (region: string, instanceId: string, action: AllowedAction) => {
  const clients = buildClients(region);
  switch (action) {
    case 'start':
      await clients.ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
      break;
    case 'stop':
      await clients.ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
      break;
    case 'terminate':
      await clients.ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
      break;
    case 'reboot':
      await clients.ec2.send(new RebootInstancesCommand({ InstanceIds: [instanceId] }));
      break;
    default:
  }
};

const createInstance = async (payload: CreateInstancePayload) => {
  const envConfig = env();
  const region = deriveRegion(envConfig, payload.region);
  const clients = buildClients(region);

  const userData = buildUserData({
    bucket: envConfig.S3_CONFIG_BUCKET,
    ownerTag: envConfig.OWNER_TAG,
    projectTag: envConfig.PROJECT_TAG,
    port: envConfig.WIREGUARD_PORT
  });

  const runResult = await clients.ec2.send(
    new RunInstancesCommand({
      ImageId: 'resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64',
      InstanceType: envConfig.INSTANCE_TYPE,
      MinCount: 1,
      MaxCount: 1,
      IamInstanceProfile: envConfig.INSTANCE_PROFILE_ARN
        ? { Arn: envConfig.INSTANCE_PROFILE_ARN }
        : undefined,
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            { Key: 'Name', Value: payload.name ?? 'vpn-wireguard' },
            { Key: 'Project', Value: envConfig.PROJECT_TAG },
            { Key: 'Owner', Value: envConfig.OWNER_TAG },
            { Key: 'WireGuardStatus', Value: 'pending' },
            { Key: 'CreatedAt', Value: new Date().toISOString() }
          ]
        }
      ],
      UserData: userData,
      NetworkInterfaces: [
        {
          DeviceIndex: 0,
          AssociatePublicIpAddress: true,
          DeleteOnTermination: true
        }
      ]
    })
  );

  const instance = runResult.Instances?.[0];
  if (!instance?.InstanceId) {
    throw new Error('Instance could not be launched');
  }

  if (payload.name) {
    await clients.ec2.send(
      new CreateTagsCommand({
        Resources: [instance.InstanceId],
        Tags: [{ Key: 'Name', Value: payload.name }]
      })
    );
  }

  return {
    instanceId: instance.InstanceId,
    region
  };
};

const listInstances = async (region: string) => {
  const envConfig = env();
  const clients = buildClients(region);
  const response = await clients.ec2.send(
    new DescribeInstancesCommand({
      Filters: [
        { Name: 'tag:Project', Values: [envConfig.PROJECT_TAG] },
        { Name: 'instance-state-name', Values: ['pending', 'running', 'stopped', 'stopping'] }
      ]
    })
  );

  const instances = response.Reservations?.flatMap((reservation) =>
    (reservation.Instances ?? []).map((instance) => mapInstance(instance, region))
  );

  return instances ?? [];
};

const getConfig = async (region: string, instanceId: string): Promise<ConfigResponse> => {
  const envConfig = env();
  const clients = buildClients(region);
  const key = `${envConfig.PROJECT_TAG}/${envConfig.OWNER_TAG}/${instanceId}.conf`;
  const command = new GetObjectCommand({
    Bucket: envConfig.S3_CONFIG_BUCKET,
    Key: key
  });
  const signedUrl = await getSignedUrl(clients.s3, command, { expiresIn: 300 });

  let configBody = '';
  try {
    const object = await clients.s3.send(command);
    configBody = await object.Body?.transformToString('utf-8');
  } catch (error) {
    // When file not ready yet we still return signed url so the frontend can poll later.
  }

  const response: ConfigResponse = {
    filename: `${instanceId}.conf`,
    region,
    instanceId,
    contentType: 'text/plain',
    configBody,
    lastUpdated: new Date().toISOString(),
    signedUrl
  };

  return response;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const { requestContext, rawPath, body } = event;
  const method = requestContext.http.method;
  const path = rawPath ?? '/';

  try {
    const envConfig = env();

    if (method === 'OPTIONS') {
      return jsonResponse(200, { ok: true });
    }

    if (method === 'GET' && path === '/health') {
      return jsonResponse(200, { status: 'ok', project: envConfig.PROJECT_TAG });
    }

    if (method === 'GET' && path === '/regions') {
      return jsonResponse(200, { regions: envConfig.ALLOWED_REGIONS });
    }

    if (method === 'GET' && path === '/instances') {
      const region = deriveRegion(envConfig, event.queryStringParameters?.region);
      const instances = await listInstances(region);
      return jsonResponse(200, { instances, region });
    }

    if (method === 'POST' && path === '/instances') {
      const payload = parseBody(body, bodySchema);
      const result = await createInstance(payload as CreateInstancePayload);
      return jsonResponse(201, { instance: result });
    }

    if (method === 'POST' && /\/instances\/[^/]+\/actions$/.test(path)) {
      const instanceId = extractInstanceId(path);
      if (!instanceId) {
        return jsonResponse(400, { message: 'Missing instanceId' });
      }
      const payload = parseBody(body, actionSchema);
      const region = deriveRegion(envConfig, event.queryStringParameters?.region);
      await performAction(region, instanceId, payload.action as AllowedAction);
      return jsonResponse(200, { instanceId, action: payload.action });
    }

    if (method === 'GET' && /\/instances\/[^/]+\/config$/.test(path)) {
      const instanceId = extractInstanceId(path);
      if (!instanceId) {
        return jsonResponse(400, { message: 'Missing instanceId' });
      }
      const region = deriveRegion(envConfig, event.queryStringParameters?.region);
      const config = await getConfig(region, instanceId);
      return jsonResponse(200, config);
    }

    return jsonResponse(404, { message: 'Not found' });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error while handling request';
    return jsonResponse(500, { message });
  }
};
