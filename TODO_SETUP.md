# TODO — Skeleton Test Setup

## Must do before first run

- [ ] Run `/setup-deploy` to generate secrets and create local `.env` files

## Must do before deployment

- [ ] Run `/setup-deploy` to configure GitHub secrets, variables, and environments
- [ ] Set up your server using the Ansible playbook (https://gitlab.kosm.io/infra/ansible-host-setup) — or ask Luc (Neipa required)
- [ ] Configure domain name and DNS — then update:
  - `HOST_NAME` in `infra/deploy/overlays/dev/.env.dev` and `prod/.env.prod`
  - `STRAPI_BASE_URL` and `STRAPI_PUBLIC_URL` in the same files
  - `site` URL in `web/astro.config.mjs`

## Should do soon

- [ ] Replace logo and favicon (`web/public/assets/skelly.png`, `skelly-head.png`, `favicon.png`)
- [ ] Customize the homepage content (`web/src/pages/index.astro`)
- [ ] Review and update meta descriptions
- [ ] Set up Matomo analytics instance (if needed)
- [ ] Configure Brevo for contact form and newsletter (API key, template, list)

## Nice to have

- [ ] Configure backups for PostgreSQL data
- [ ] Set up monitoring/alerting
