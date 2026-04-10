<p align="center">
  <img src="web/public/assets/skelly.png" alt="Skeleton Test" width="180" />
</p>

<h1 align="center">Skeleton Test</h1>

<p align="center">
  Projet full-stack <strong>Astro 6</strong> + <strong>Strapi v5</strong>.<br/>
  CMS headless, formulaire de contact, newsletter, cookie consent, Docker.
</p>

---

## Stack technique

| Couche          | Technologie          | Version     |
|-----------------|----------------------|-------------|
| CMS             | Strapi               | 5.40        |
| Frontend        | Astro (SSR, Node.js) | 6.0         |
| UI              | React                | 19          |
| Styling         | Tailwind CSS         | 4.2         |
| Base de données | PostgreSQL           | 15          |
| Emails          | Brevo                | SDK v5      |
| Anti-bot        | Altcha               | (self-hosted) |
| Analytics       | Matomo               | (optionnel) |
| Package manager | pnpm                 | —           |
| Conteneurs      | Docker Compose       | —           |

## Démarrage rapide

### Prérequis

- **Node.js** 20+
- **pnpm** (`corepack enable`)
- **Docker** (pour PostgreSQL)

### 1. Cloner et installer

```bash
git clone git@github.com:Kosmio/skeleton-test.git && cd skeleton-test

# Installer les dépendances
cd strapi && pnpm install && cd ..
cd web && pnpm install && cd ..
```

### 2. Configurer l'environnement

```bash
# Strapi
cp strapi/.env.example strapi/.env
# → Les valeurs par défaut fonctionnent pour le développement local

# Web
cp web/.env.example web/.env
# → STRAPI_KEY doit être renseigné après le premier démarrage de Strapi
```

### 3. Lancer

```bash
# Terminal 1 — Base de données
make infra-up

# Terminal 2 — Strapi
cd strapi && pnpm develop
# → http://localhost:1337/admin

# Terminal 3 — Frontend
cd web && pnpm dev
# → http://localhost:4321
```

Au premier lancement, Strapi :
- Configure le français comme locale par défaut
- Crée 3 articles de démonstration

### 4. Connecter le frontend à Strapi

1. Ouvrir http://localhost:1337/admin et créer un compte administrateur
2. Aller dans **Settings → API Tokens** et créer un token (Full access)
3. Coller le token dans `web/.env` à la clé `STRAPI_KEY`
4. Redémarrer le serveur web

## Déploiement

```bash
# Construire les images
make build

# Pousser vers le registry
make stage

# Déployer via le script
./infra/deploy/scripts/deploy.sh <local|dev|prod> <up|down|logs|ps|restart>
```

Le déploiement en production se fait via GitHub Actions (workflow "Deploy").

---

<p align="center">
  <img src="web/public/assets/skelly-head.png" alt="Skeleton Test" width="40" />
</p>
