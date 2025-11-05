import { z } from 'zod';

const userDataTemplate = ({
  bucket,
  projectTag,
  ownerTag,
  port
}: {
  bucket: string;
  projectTag: string;
  ownerTag: string;
  port: number;
}): string => `#!/bin/bash
set -euxo pipefail
exec > >(tee /var/log/wireguard-bootstrap.log|logger -t user-data -s 2>/dev/console) 2>&1

REGION="$(curl -s http://169.254.169.254/latest/meta-data/placement/region)"
INSTANCE_ID="$(curl -s http://169.254.169.254/latest/meta-data/instance-id)"

yum update -y
yum install -y wireguard-tools iptables-services jq awscli

mkdir -p /etc/wireguard
cd /etc/wireguard

if [ ! -f /etc/wireguard/server_private.key ]; then
  umask 077
  wg genkey | tee server_private.key | wg pubkey > server_public.key
fi

if [ ! -f /etc/wireguard/client.key ]; then
  umask 077
  wg genkey | tee client_private.key | wg pubkey > client_public.key
fi

SERVER_PRIVATE_KEY=$(cat server_private.key)
SERVER_PUBLIC_KEY=$(cat server_public.key)
CLIENT_PRIVATE_KEY=$(cat client_private.key)
CLIENT_PUBLIC_KEY=$(cat client_public.key)

cat >/etc/wireguard/wg0.conf <<EOF
[Interface]
PrivateKey = \${SERVER_PRIVATE_KEY}
Address = 10.8.0.1/24
ListenPort = ${port}
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
SaveConfig = true

[Peer]
PublicKey = \${CLIENT_PUBLIC_KEY}
AllowedIPs = 10.8.0.2/32
PersistentKeepalive = 25
EOF

systemctl enable --now wg-quick@wg0

cat > /etc/wireguard/client.conf <<EOF
[Interface]
PrivateKey = \${CLIENT_PRIVATE_KEY}
Address = 10.8.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = \${SERVER_PUBLIC_KEY}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = $(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):${port}
PersistentKeepalive = 25
EOF

aws s3 cp /etc/wireguard/client.conf s3://${bucket}/${projectTag}/${ownerTag}/\${INSTANCE_ID}.conf --region "$REGION"
aws ec2 create-tags --resources "\${INSTANCE_ID}" --tags Key=WireGuardStatus,Value=ready --region "$REGION"
`;

export const buildUserData = (params: {
  bucket: string;
  projectTag: string;
  ownerTag: string;
  port: number;
}): string => Buffer.from(userDataTemplate(params)).toString('base64');

const clientConfigSchema = z.object({
  interface: z.object({
    privateKey: z.string().min(1),
    address: z.string().min(1),
    dns: z.string().min(1)
  }),
  peer: z.object({
    publicKey: z.string().min(1),
    endpoint: z.string().min(1),
    allowedIPs: z.string().min(1),
    persistentKeepalive: z.string().optional()
  })
});

export const parseClientConfig = (config: string) => {
  const sections = config
    .split(/\r?\n\r?\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const mapSection = (lines: string[]) =>
    Object.fromEntries(
      lines
        .slice(1)
        .map((line) => line.split('=').map((part) => part.trim()))
        .filter((pair) => pair.length === 2)
    );

  const parsed = sections.reduce(
    (acc, section) => {
      const lines = section.split(/\r?\n/);
      if (!lines.length) return acc;
      if (/^\[Interface\]/i.test(lines[0])) {
        acc.interface = mapSection(lines);
      }
      if (/^\[Peer\]/i.test(lines[0])) {
        acc.peer = mapSection(lines);
      }
      return acc;
    },
    {} as Record<string, Record<string, string>>
  );

  return clientConfigSchema.parse({
    interface: {
      privateKey: parsed.interface?.PrivateKey ?? '',
      address: parsed.interface?.Address ?? '',
      dns: parsed.interface?.DNS ?? ''
    },
    peer: {
      publicKey: parsed.peer?.PublicKey ?? '',
      endpoint: parsed.peer?.Endpoint ?? '',
      allowedIPs: parsed.peer?.AllowedIPs ?? '',
      persistentKeepalive: parsed.peer?.PersistentKeepalive
    }
  });
};
