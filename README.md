# Kado

Application de gestion d'echanges de cadeaux entre amis.

Le depot est organise en monorepo PNPM avec 3 briques principales:

- une API HTTP Node.js/Express
- une application Web Vue 3
- un package partage de contrats (types et schemas)

## Architecture

```text
kado/
|- apps/
|  |- api/          # Backend Express + logique metier
|  |- web/          # Frontend Vue 3 + Vite
|- packages/
|  |- shared/       # DTO, schemas Zod, types partages
```

### Vue d'ensemble technique

- `apps/api`
  - entree: `src/server.ts`
  - app Express: `src/app.ts`
  - couches principales:
    - `routes/` pour les endpoints HTTP
    - `services/` pour la logique metier
    - `repositories/` pour le stockage en memoire (in-memory)
    - `middleware/` pour validation et gestion d'erreurs
- `apps/web`
  - Vue 3 + Vite + Vue Router + Pinia
  - i18n (`vue-i18n`) avec locales `fr-CA` et `en-CA`
  - UI basee sur Bootstrap 5
- `packages/shared`
  - schemas Zod et DTO communs, importes par l'API et le Web

## Librairies et standards utilises

- Runtime et langage
  - Node.js (>= 20.19 recommande)
  - TypeScript (strict)
  - PNPM workspaces
- API
  - Express 5
  - Zod (validation de schemas)
  - Helmet, CORS, Morgan
  - Jest + Supertest (tests API)
- Web
  - Vue 3
  - Vite
  - Pinia
  - Vue Router
  - Vue I18n
  - Bootstrap + Bootstrap Icons
  - vite-plugin-pwa (PWA)
- Qualite et style
  - ESLint
  - Oxlint
  - Prettier

## Prerequis

- Node.js: `^20.19.0 || >=22.12.0`
- PNPM: `10.x`

## Installation

Depuis la racine du depot:

```bash
pnpm install
```

## Lancer en developpement

Dans 2 terminaux distincts:

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

Par defaut:

- API: http://localhost:3000
- Web: http://localhost:5173

## Build

Build de l'application Web:

```bash
pnpm build:web
```

Build de l'API:

```bash
pnpm build:api
```

## Tests et verification

Tests API:

```bash
pnpm --dir apps/api test
```

Type-check + build Web:

```bash
pnpm --dir apps/web build
```

Lint Web:

```bash
pnpm --dir apps/web lint
```

## Variables d'environnement utiles

### API (`apps/api`)

- `SERVER_PORT`: port HTTP de l'API (defaut: `3000`)
- `PUBLIC_BASE_URL`: base URL publique pour generer les liens participant (`/p/:token`)
- `FRONTEND_BASE_URL`: fallback si `PUBLIC_BASE_URL` est absent

### Web (`apps/web`)

- `VITE_API_BASE`: base URL de l'API (defaut: `http://localhost:3000`)

## Notes

- Le stockage actuel cote API est en memoire (repositories in-memory), adapte au dev/tests.
- Le package `@kado/shared` centralise les contrats pour garder le front et le back synchronises.
