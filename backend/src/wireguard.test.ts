import { describe, expect, it } from 'vitest';

import { parseClientConfig } from './wireguard.js';

describe('parseClientConfig', () => {
  it('parses WireGuard client configuration', () => {
    const sample = `[Interface]
PrivateKey = abc
Address = 10.0.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = def
AllowedIPs = 0.0.0.0/0
Endpoint = test:51820
PersistentKeepalive = 25`;

    const result = parseClientConfig(sample);
    expect(result.interface.address).toBe('10.0.0.2/32');
    expect(result.peer.endpoint).toBe('test:51820');
  });
});
