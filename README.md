# VPN Control PWA

Progressive Web App and AWS Lambda backend to provision personal WireGuard-enabled EC2 instances on demand.

## Structure

- `frontend/` — React + Vite PWA for managing your VPN fleet and exporting WireGuard profiles.
- `backend/` — TypeScript AWS Lambda function exposed through API Gateway.
- `docker/` — Docker resources for local development.
- `.github/workflows/` — CI pipeline running lint/build/tests.

See `docs/` for in-depth architecture and deployment details.

## Getting Started

1. Copy `.env.example` to `.env.local` and adjust AWS details (S3 bucket, instance profile, etc.).
2. Install dependencies:
   ```bash
   npm install --prefix backend
   npm install --prefix frontend
   ```
3. Run the backend locally (http://localhost:3000):
   ```bash
   npm run dev --prefix backend
   ```
4. Start the PWA (http://localhost:5173):
   ```bash
   npm run dev --prefix frontend
   ```

The frontend proxies API calls to the backend via `/api` during development.

## Docker Dev Environment

```bash
docker compose up --build
```

This builds the Node.js image defined in `docker/dev.Dockerfile`, installs dependencies, runs the backend API emulator, and serves the PWA with hot reload. Update environment variables in `docker-compose.yml` for your AWS account.

## CI/CD

- GitHub Actions workflow (`.github/workflows/ci.yml`) installs dependencies, lints, tests, builds, puis déploie automatiquement l'infra et le frontend sur `main`.
- Le job `deploy` package la Lambda avec SAM, applique le stack CloudFormation, synchronise la PWA vers un bucket S3, supprime ensuite le bucket d'artefacts SAM.

### Secrets GitHub à définir

| Secret | Description |
| --- | --- |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Obligatoire. Identifiants IAM autorisés à créer les stacks, les buckets. |
| `AWS_REGION` (optionnel) | Région utilisée par la CI/CD. Par défaut `eu-west-3` si le secret est absent. |
| `SAM_STACK_NAME` (optionnel) | Nom du stack CloudFormation (défaut `vpn-pwa`). |
| `SAM_ARTIFACT_BUCKET` (optionnel) | Bucket S3 pour les artefacts SAM. Laisse vide pour qu'il soit créé automatiquement (`<stack>-artifacts`). |
| `VPN_CONFIG_BUCKET` (optionnel) | Bucket S3 pour les fichiers WireGuard. Vide ⇒ créé automatiquement (`<stack>-wireguard-config`). |
| `VPN_INSTANCE_PROFILE_ARN` (optionnel) | ARN d'un profile IAM EC2 existant. Vide ⇒ le stack crée un rôle + profile adapté. |
| `VPN_API_URL` (optionnel) | URL publique de l'API. Vide ⇒ la CI récupère l'endpoint API Gateway du stack. |
| `FRONTEND_BUCKET` (optionnel) | Bucket S3 pour héberger la PWA. Vide ⇒ créé automatiquement (`<stack>-pwa-hosting`). |
| `FRONTEND_PUBLIC_URL` (optionnel) | URL publique de la PWA (affichée dans l’onglet Environments GitHub). |
| `VPN_PROJECT_TAG`, `VPN_OWNER_TAG`, `VPN_INSTANCE_TYPE`, `VPN_ALLOWED_REGIONS`, `VPN_DEFAULT_REGION`, `VPN_WG_PORT` (optionnels) | Override des paramètres par défaut du template SAM (`VPN_INSTANCE_TYPE` par défaut `t4g.micro`). |

Le workflow crée automatiquement les buckets et l'instance profile si tu laisses les secrets correspondants vides. Ton utilisateur IAM doit toutefois avoir les autorisations `s3:*`, `cloudformation:*`, `iam:PassRole/iam:CreateRole`, `iam:CreateInstanceProfile`, etc. Si `AWS_REGION` n'est pas fourni, la CI utilisera `eu-west-3` par défaut.

Le build frontend utilise `VPN_API_URL` si présent, sinon il récupère l'endpoint HTTP API renvoyé par CloudFormation.

## Deployment Notes

- Le stack peut créer automatiquement les buckets (config + frontend) ainsi que le profile IAM EC2 (`INSTANCE_PROFILE_ARN`). Tu peux aussi fournir tes ressources existantes via les secrets. Par défaut, les instances EC2 déployées sont des `t4g.micro` (ARM64) basées sur l'AMI Amazon Linux 2023 arm64 (`al2023-ami-kernel-default-arm64`).
- Expose the Lambda via API Gateway and configure CORS to allow your PWA origin.
- Provide the API URL to the frontend via `VITE_API_URL` at build time.
- Use `infra/template.yaml` with AWS SAM to deploy the Lambda + HTTP API quickly.

## WireGuard Export UX

- iOS: tap **Exporter vers WireGuard (iOS)**, the PWA uses the Web Share API (when available) to hand the `.conf` file to the official WireGuard app.
- Desktop: tap **Télécharger (PC)** to download `vpn.conf`, then run `wireguard.exe /installtunnelservice vpn.conf` on Windows (or import manually on macOS/Linux).
