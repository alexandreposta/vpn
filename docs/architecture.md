# Architecture Overview

## Frontend

- Vite + React + TypeScript PWA with Tailwind CSS for minimal styling.
- Uses the Fetch API against the backend REST endpoints.
- Provides:
  - Dashboard with list of WireGuard-capable EC2 instances.
  - Actions to create, destroy, start, and stop instances in chosen regions.
  - Export flow for iOS (Web Share / file hand-off) and desktop (direct download).
- Caches static assets via service worker and supports offline-ready UI shell.

## Backend

- Single AWS Lambda (Node.js 20) behind API Gateway REST API.
- Uses AWS SDK v3 to orchestrate:
  - EC2 instance lifecycle (launch template with WireGuard user data).
  - SSM send-command to finish WireGuard configuration and push profiles to S3.
  - S3 bucket to persist generated configs.
- Data model keyed by tags (`Project=vpn-pwa`, `Owner=<configured>`).
- Outputs signed URL + metadata so frontend can download configuration files.

## Infrastructure

- Parameters managed via environment variables / Secrets Manager:
  - `INSTANCE_TYPE` (default `t4g.micro`), `WIREGUARD_PORT`, `S3_CONFIG_BUCKET`, `ALLOWED_REGIONS`, `DEFAULT_REGION`.
  - `INSTANCE_PROFILE_ARN` for the EC2 IAM profile that writes the WireGuard config into S3.
  - Leave the S3/IAM parameters empty to let the stack auto-provision dedicated buckets and an instance profile.
  - The Lambda launches `t4g.micro` instances from the Amazon Linux 2023 arm64 SSM parameter (`al2023-ami-kernel-default-arm64`).
- IAM role grants least-privilege access to EC2/SSM/S3.
- Suggested deployment via AWS SAM or Terraform (see `infra/` template).

### SAM Deployment Flow

1. Build the backend: `npm run build --prefix backend`.
2. Package artefacts: `sam package --template-file infra/template.yaml --output-template-file packaged.yaml --s3-bucket <deployment-bucket>`.
3. Deploy: `sam deploy --template-file packaged.yaml --stack-name vpn-pwa --capabilities CAPABILITY_IAM --parameter-overrides ConfigBucketName=<config-bucket-or-empty> FrontendBucketName=<frontend-bucket-or-empty> InstanceProfileArn=<profile-arn-or-empty> InstanceType=t4g.micro` (ou ton type personnalisé compatible arm64).

## Local Development

- Docker image with Node.js 20 + npm to run lint/test/build for both apps.
- `docker-compose.yml` spins up the backend HTTP emulator (`npm run dev`) and the frontend dev server.
- `.env.*` files hold mock credentials when running locally.

## CI/CD

- GitHub Actions workflow:
  - Installe les dépendances avec npm.
  - Exécute lint, tests, build pour front/back.
  - Prépare/initialise les buckets manquants, package le backend via `sam package`, déploie le stack CloudFormation, puis sync la PWA sur un bucket S3 (créé automatiquement si besoin).
  - Nettoie le bucket d'artefacts SAM après déploiement.
  - Utilise `eu-west-3` comme région par défaut si `AWS_REGION` n'est pas fourni côté GitHub.

Adjust IAM, network security groups, and S3 policies before production use.
