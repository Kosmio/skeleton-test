# Infrastructure Practices

This guide covers Docker, deployment, CI/CD, and operational patterns for the skeleton project.

---

## Architecture Overview

The project uses Docker Compose with a **base + overlay** pattern for multi-environment deployments, Traefik as a reverse proxy with Let's Encrypt TLS, and GitHub Actions for CI/CD:

```
.github/workflows/
├── dev.yml                         # Build & push Docker images
└── deploy.yml                      # SSH remote deployment
infra/
├── deploy/
│   ├── base/
│   │   └── docker-compose.base.yml     # All services defined once (incl. Traefik)
│   ├── overlays/
│   │   ├── local/                      # Local dev (Postgres only, Traefik disabled)
│   │   │   ├── docker-compose.override.yml
│   │   │   └── .env.local
│   │   ├── dev/                        # Dev deployment (Traefik + TLS)
│   │   │   ├── docker-compose.override.yml
│   │   │   └── .env.dev
│   │   └── prod/                       # Production (Traefik + TLS + resource limits)
│   │       ├── docker-compose.override.yml
│   │       └── .env.prod
│   └── scripts/
│       └── deploy.sh                   # Unified deployment script
├── docker/
│   ├── strapi/Dockerfile               # Strapi two-stage build (Node 22)
│   └── website/Dockerfile              # Astro two-stage build (Node 22)
└── make/
    ├── make_strapi.mk                  # Strapi build targets
    └── make_web.mk                     # Web build targets
```

---

## Reverse Proxy (Traefik)

Traefik v3 serves as the reverse proxy for all deployed environments (dev, prod). It handles:
- **TLS termination** via Let's Encrypt ACME (HTTP challenge)
- **Single-domain routing**: web serves `/`, Strapi serves `/strapi`, MCP serves `/mcp` — all via path prefix
- **HTTP→HTTPS redirect** for all traffic
- **Auto-discovery** of services via Docker labels

### How routing works

Traefik is defined in `docker-compose.base.yml` with ACME configuration. In the environment overlays, each service gets Traefik labels:

- **Strapi**: `Host(hostname) && PathPrefix(/strapi)` → strip `/strapi` prefix → forward to port 1337
- **MCP**: `Host(hostname) && PathPrefix(/mcp)` → strip `/mcp` prefix → forward to port 3100
- **Web**: `Host(hostname)` → forward to port 80

This means a single domain serves the frontend, CMS, and MCP. Example:
- `https://your-domain.com/` → Astro frontend
- `https://your-domain.com/strapi/api/articles` → Strapi REST API
- `https://your-domain.com/strapi/admin` → Strapi admin panel
- `https://your-domain.com/mcp` → MCP server (AI content management)

### Configuration

Traefik-related env vars:
- `TRAEFIK_VERSION` — Traefik image version (default: `v3.6.1`)
- `ACME_EMAIL` — email for Let's Encrypt certificate notifications
- `HOST_NAME` — the domain name for routing rules

**In local development**, Traefik is disabled (`profiles: [disabled]`). Strapi and web run directly on the host.

---

## Base + Overlay Pattern

### Environment layering

Environment variables use a **two-tier system** to avoid duplication:

1. **Base layer** (`base/.env.base`): Shared defaults loaded first — `PROJECT_SLUG`, versions, registry, postgres hostname, Strapi internal URL, ACME email. All derived values use variable substitution (e.g., `DOCKER_NETWORK=${PROJECT_SLUG}-network`).
2. **Overlay layer** (`overlays/<env>/.env.<env>`): Environment-specific overrides loaded second — only what differs (domain, passwords, secrets placeholders).

`deploy.sh` loads both files via `--env-file` flags. The overlay overrides the base.

### PROJECT_SLUG

`PROJECT_SLUG` is defined once in `.env.base` and propagates everywhere via `${PROJECT_SLUG}`:
- Container names: `${PROJECT_SLUG}-postgres`, `${PROJECT_SLUG}-strapi`, `${PROJECT_SLUG}-web`, `${PROJECT_SLUG}-traefik`
- Network: `${PROJECT_SLUG}-network`
- Volume names: `${PROJECT_SLUG}-postgres-data`, `${PROJECT_SLUG}-traefik-certificates`
- Image names: `${DOCKER_REGISTRY_REPOSITORY}${PROJECT_SLUG}-strapi:${APP_VERSION}`
- Compose project name: `${PROJECT_SLUG}-<environment>`
- Local volume path: `~/DockerVolumes/${PROJECT_SLUG}/postgres`
- Deploy server path: `~/${PROJECT_SLUG}/infra/deploy`

The `/start` wizard changes `PROJECT_SLUG` in `.env.base` — everything else follows automatically.

### Base compose

`docker-compose.base.yml` defines all services once with their full configuration: traefik, postgres, strapi, web. Overlays only add or override what changes per environment.

**Rules:**
- Every service must include `platform: linux/amd64` for consistent builds
- The network must be `external: true` (created by `deploy.sh`, not by compose)
- Use `${VARIABLE}` substitution for anything that changes between environments (image tags, passwords, URLs)
- Container names and image names must use `${PROJECT_SLUG}` — never hardcode the project name
- Strapi and web services must include `labels: <<: *common-labels` for Traefik network discovery

### Overlay conventions

Each environment directory has:
- `docker-compose.override.yml` — service overrides (ports, volumes, restart policies, resource limits, Traefik labels)
- `.env.<env>` — environment-specific overrides (only what differs from base)

**Local overlay:**
- Only Postgres runs in Docker
- Strapi, web, and Traefik are disabled (`profiles: [disabled]`) — Strapi and web run on the host via `pnpm`
- Postgres data mounts to `~/DockerVolumes/<project>/postgres` for persistence across rebuilds
- Ports are bound to `0.0.0.0` (accessible from host)

**Dev overlay:**
- All services run in Docker including Traefik
- Traefik labels on strapi and web for single-domain routing
- `restart: unless-stopped`
- Named volumes for data and TLS certificates
- Postgres bound to `127.0.0.1:5432` (localhost only)

**Prod overlay:**
- Same as dev but with `restart: always` and memory limits:
  - Traefik: 256M
  - Postgres: 2G
  - Strapi: 1G
  - Web: 1G

---

## Dockerfiles

### Two-stage builds

Both services use two-stage Dockerfiles: a build stage that installs dependencies and compiles, and a runtime stage that copies only what's needed.

**Strapi Dockerfile (`infra/docker/strapi/Dockerfile`):**
```dockerfile
# Build stage: Node 22 Alpine, install deps, build admin panel
FROM node:22-alpine AS build
ENV CI=true
# ... install, build with ADMIN_URL and STRAPI_ADMIN_BACKEND_URL args
RUN pnpm build

# Runtime stage: copy built app, run
FROM node:22-alpine
COPY --from=build /app /app
CMD ["pnpm", "start"]
```

**Web Dockerfile (`infra/docker/website/Dockerfile`):**
```dockerfile
# Build stage: Node 22 Bullseye (full toolchain for native deps)
FROM node:22-bullseye AS node-build
ENV CI=true
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Runtime stage: Node 22 Alpine (minimal, small image)
FROM node:22-alpine AS node-server
# Copy dist, package.json, pnpm-lock.yaml
RUN pnpm install --prod --frozen-lockfile
CMD ["node", "dist/server/entry.mjs"]
```

**Rules:**
- Use `node:22-alpine` for Strapi (lightweight, native deps compile fine on Alpine)
- Use `node:22-bullseye` for web build stage (full toolchain), `node:22-alpine` for runtime (smaller image)
- Always set `ENV CI=true` in build stages for CI-optimized installs
- Use `--frozen-lockfile` for all installs to ensure reproducible builds
- Always enable pnpm via corepack in both stages
- `EXPOSE` the correct port (1337 for Strapi, 80 for web)
- Strapi accepts build args `ADMIN_URL` and `STRAPI_ADMIN_BACKEND_URL` for configurable admin path
- Strapi builds at Docker build time (`RUN pnpm build`), not at container start

### Web production command

The Astro Node.js adapter produces a standalone server:

```dockerfile
CMD ["/bin/sh", "-c", "HOST=0.0.0.0 PORT=80 node dist/server/entry.mjs"]
```

Set `HOST=0.0.0.0` and `PORT=80` as environment variables so the server binds correctly in Docker.

---

## CI/CD (GitHub Actions)

### Build & Push (`dev.yml`)

Triggers on push to `main`, tags, or manual dispatch. Runs two parallel jobs:
- `docker-strapi`: builds and pushes the Strapi image to GHCR
- `docker-web`: builds and pushes the web image to GHCR

Image tags use the version from the `VERSION` file. The registry uses `github.repository_owner` to auto-detect the org.

### Deploy (`deploy.yml`)

Manual workflow dispatch with inputs:
- `environment`: dev or prod (maps to GitHub environments for scoped secrets)
- `version`: semver string (e.g., `0.1.0`)
- `reset_db`: boolean, drops and recreates the database schema

**Deployment flow:**
1. Validate version format
2. Setup SSH connection to deploy host
3. Create `.env.secrets` from GitHub secrets
4. Copy infra files to server via `tar | ssh`
5. Pull Docker images on the server
6. (Optional) Reset database: stop Strapi, `DROP SCHEMA public CASCADE`, Strapi re-seeds on next start
7. Merge `.env.secrets` into env file, update version, run `deploy.sh up`
8. Verify containers are running and env vars are correct
9. Cleanup secrets files from server

### Required GitHub configuration

**Repository secrets:**
- `SSH_PRIVATE_KEY` — SSH key for deploy host access
- `SECRET_POSTGRES_PASSWORD`, `SECRET_STRAPI_APP_KEYS`, `SECRET_STRAPI_API_TOKEN_SALT`, `SECRET_STRAPI_ADMIN_JWT_SECRET`, `SECRET_STRAPI_JWT_SECRET`
- `SECRET_ALTCHA_HMAC_KEY`, `SECRET_EMAIL_API_KEY`, `SECRET_EMAIL_CONTACT_TEMPLATE_ID`
- `SECRET_PUBLIC_MATOMO_URL`, `SECRET_PUBLIC_MATOMO_SITE_ID`

**Repository variables:**
- `DEPLOY_HOST` — server hostname or IP
- `DEPLOY_USER` — SSH user
- `SSH_PORT` — SSH port (if not 22)
- `EMAIL_LIST_ID` — Brevo mailing list ID

**GitHub environments:** Create `dev` and `prod` environments for environment-scoped secrets if needed.

---

## Deployment Script

`deploy.sh` is the single entry point for all deployment operations:

```bash
./infra/deploy/scripts/deploy.sh <environment> <action> [options]
```

**Environments:** `local`, `dev`, `prod`

**Actions:**
| Action | Description |
|---|---|
| `up` | Create network if needed, start services |
| `down` | Stop and remove containers |
| `logs` | Follow container logs |
| `ps` | Show service status |
| `pull` | Pull latest images |
| `restart` | Restart services |
| `config` | Show merged compose config |
| `validate` | Validate compose YAML |
| `kill` | Force kill containers and networks |

**Options:**
- `--skip-services postgres,strapi` — exclude services from the action

**Rules:**
- The script creates the Docker network if it doesn't exist
- Always use `deploy.sh` rather than raw `docker compose` commands — it handles env file layering and network creation
- The script loads `base/.env.base` first, then the environment overlay `.env.<env>` second (overlay overrides base)
- `PROJECT_SLUG` is extracted from `.env.base` and used for the compose project name (`${PROJECT_SLUG}-<env>`)
- The `DOCKER_COMPOSE_ENV_FILE` env var can override the default overlay env file path (used by CI/CD to pass the merged env+secrets file)

---

## Makefiles

The root `Makefile` delegates to per-service makefiles:

```make
# Root Makefile
include infra/make/make_strapi.mk
include infra/make/make_web.mk

infra-up:
	./infra/deploy/scripts/deploy.sh local up
```

### Per-service targets

Each `make_*.mk` provides:

| Target | Description |
|---|---|
| `lint` | Lint Dockerfile with hadolint |
| `build` | Build Docker image |
| `stage` | Tag and push to registry |

Images are tagged with the version from `VERSION` at the project root.

The Strapi build target passes `ADMIN_URL` and `STRAPI_ADMIN_BACKEND_URL` as build args.

**Rules:**
- Version is managed in a single `VERSION` file at the root — all makefiles read from it
- Registry URL comes from the environment overlay's `.env.*` file
- Hadolint must pass before any image is pushed

---

## Environment Variables & Secrets

### Separation of concerns

- `base/.env.base` contains shared defaults (`PROJECT_SLUG`, versions, registry, etc.) — committed
- `.env.example` files document all variables with placeholder values — always committed
- `.env.<env>` files contain environment-specific overrides — committed
- `.env.secrets` files contain actual secrets — never committed (in `.gitignore`)
- At deploy time, CI/CD creates `.env.secrets` from GitHub secrets, merges it into the env file, and cleans up after deployment

### Secrets merge pattern

The deploy workflow:
1. Writes GitHub secrets to `/tmp/.env.secrets`
2. Copies it to the server at `overlays/<env>/.env.secrets`
3. Merges: `cp .env.<env> .env.<env>.merged && cat .env.secrets >> .env.<env>.merged`
4. Passes the merged file to deploy.sh via `DOCKER_COMPOSE_ENV_FILE`
5. After deploy, deletes both `.env.secrets` and `.env.<env>.merged` from the server

### Gitignore patterns

```gitignore
/.env*                                    # Root env files
infra/deploy/overlays/*/.env.secrets      # Per-environment secrets
infra/deploy/overlays/*/.env.*.merged     # Merged env files (generated)
```

**Rules:**
- Never commit actual secrets (API keys, passwords, JWT secrets)
- Always provide `.env.example` with descriptive placeholder values
- Use `changeme`, `your-*`, or empty strings as placeholders
- Document which variables are required vs optional

---

## Versioning

The project version is stored in `VERSION` at the root:

```
0.1.0
```

This version is used for:
- Docker image tags
- Compose service image references (`${DOCKER_REGISTRY_REPOSITORY}${PROJECT_SLUG}-strapi:${APP_VERSION}`)
- Deploy workflow version input

Bump this file when releasing a new version. All makefiles, compose files, and CI/CD workflows derive their version from it.

---

## Local Development Workflow

```bash
# 1. Start infrastructure (Postgres)
make infra-up

# 2. Start Strapi (in strapi/ directory)
pnpm develop

# 3. Start Astro dev server (in web/ directory)
pnpm dev

# Strapi: http://localhost:1337 (admin: /admin)
# Web:    http://localhost:4321
```

**Rules:**
- In local, Strapi and web always run on the host — never in Docker
- Traefik is disabled in local — no reverse proxy needed
- Postgres runs in Docker with a host volume so data persists
- The web `.env` points `STRAPI_URL` to `http://localhost:1337`
- The web `.env` points `REACT_STRAPI_URL` to `http://localhost:1337` (same in local, different in prod)
