# VPN Control Apps

Toolkit to provision on-demand WireGuard-enabled EC2 instances (serverless backend) with two independent frontends:

- **Desktop** - Electron shell for a native experience on Windows/macOS/Linux.
- **iOS/Web** - Vite/React PWA installable from Safari (Add to Home Screen) with offline support.

## Structure

- `backend/` - TypeScript Lambda handler exposed through API Gateway (unchanged).
- `apps/ios/` - Standalone PWA codebase (Vite + React + Tailwind + React Query).
- `apps/desktop/` - Electron desktop app (React renderer + Electron shell) built independently.
- `docker/` - Shared Node 20 dev image used by docker-compose services.
- `infra/` - SAM template + helper scripts when you need to redeploy AWS resources manually.
- `docs/` - Architecture notes and troubleshooting.

No CI/CD remains in the repository. Build, release and infrastructure updates are now manual on purpose.

## Development workflow

### Backend API
```bash
cd backend
npm install
npm run dev         # starts the local lambda emulator on http://localhost:3000
```
Environment variables are read from `.env.local` the same way as before. The frontend proxies `/api` to `http://localhost:3000` during development.

### iOS/Web PWA
```bash
cd apps/ios
npm install
npm run dev -- --host 0.0.0.0   # http://localhost:5173
npm run build                   # outputs to apps/ios/dist
```
The Vite config now uses a `/` base path (no Electron-specific tweaks). Use `npm run build` when you need an offline bundle to upload to S3/CloudFront or to hand over to the desktop app.

### Desktop Electron app
```bash
cd apps/desktop
npm install
npm run dev       # launches the desktop Vite renderer (5174) + Electron simultaneously
npm run build     # builds the renderer then packages with electron-builder
npm run build:win # builds the portable Windows target (requires Wine on Linux)
```
The renderer is now a standalone React app that talks to the backend and Electron preload directly—no dependency on the iOS build artifacts anymore.

## Docker dev environment

`docker compose up backend ios` spins up the API (port 3000) and the installable PWA (port 5173) inside containers. The `desktop` service keeps a ready-to-use toolchain for Electron builds:

```bash
# Start everything (backend, ios dev server, idle desktop builder)
docker compose up --build

# Package the desktop app from the container
docker compose exec desktop bash -lc "cd apps/desktop && npm run build"
```
Artifacts are written under `apps/desktop/release` on your host thanks to the shared workspace volume.

## Manual release checklist

1. **Backend** - run `npm run build` in `backend/` and deploy with SAM/CloudFormation using the templates in `infra/`.
2. **iOS/Web** - `npm run build` inside `apps/ios`, then upload the `dist/` folder to your hosting bucket/CloudFront distribution.
3. **Desktop** - `npm run build` (or `npm run build:win`) inside `apps/desktop`.
4. **Environment variables** - update `.env.local`, `docker-compose.yml`, and any deployment scripts manually; no GitHub secrets/CI remain.

With CI removed you are in full control: run lint/tests (`npm run lint`, `npm run test`) from each package whenever you need them, gate releases however you prefer, and push artifacts manually.
