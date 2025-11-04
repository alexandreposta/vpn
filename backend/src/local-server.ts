import type { Context } from 'aws-lambda';
import { randomUUID } from 'crypto';
import http from 'http';
import { URL } from 'url';

import { handler } from './handler';

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  const bodyChunks: Buffer[] = [];
  for await (const chunk of req) {
    bodyChunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  const body = Buffer.concat(bodyChunks).toString() || undefined;

  const event = {
    version: '2.0',
    routeKey: `${req.method} ${url.pathname}`,
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    headers: Object.fromEntries(Object.entries(req.headers).map(([key, value]) => [key, String(value)])),
    requestContext: {
      accountId: 'local',
      apiId: 'local',
      domainName: url.hostname,
      domainPrefix: 'local',
      http: {
        method: req.method,
        path: url.pathname,
        protocol: 'HTTP/1.1',
        sourceIp: req.socket.remoteAddress ?? '127.0.0.1',
        userAgent: req.headers['user-agent'] ?? 'local'
      },
      requestId: randomUUID(),
      routeKey: `${req.method} ${url.pathname}`,
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now()
    },
    body,
    isBase64Encoded: false
  } as const;

  try {
    const response = await handler(event, {} as Context, () => {});
    res.statusCode = response?.statusCode ?? 200;
    if (response?.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        if (value) {
          res.setHeader(key, value as string);
        }
      });
    }
    res.end(response?.body ?? '');
  } catch (error) {
    res.statusCode = 500;
    res.end(error instanceof Error ? error.message : 'Internal error');
  }
});

const port = Number(process.env.PORT ?? 3000);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[local] API Gateway emulator running on http://localhost:${port}`);
});
