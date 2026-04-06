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
  - routes majeures:
    - admin: `/api/exchanges/*`
    - participant public (lien magique): `/api/p/:token`
- `apps/web`
  - Vue 3 + Vite + Vue Router + Pinia
  - i18n (`vue-i18n`) avec locales `fr-CA` et `en-CA`
  - UI basee sur Bootstrap 5
  - parcours admin (`/exchanges/:id`) + parcours participant (`/p/:token`)
- `packages/shared`
  - schemas Zod et DTO communs, importes par l'API et le Web

## Fonctionnalites actuellement couvertes

- Gestion des echanges
  - creation, lecture, edition, suppression
  - statut d'echange (`draft`, `ready`, `drawn`, `archived`)
  - options de creation: organisateur, budget, date, `noMutualAssignments`, mot de passe admin
- Gestion des participants
  - CRUD des participants cote admin
  - regeneration de lien d'acces participant
- Gestion des exclusions
  - ajout/suppression de regles d'exclusion entre participants
  - verrouillage des exclusions une fois la pige effectuee ou archivee
- Pige (draw)
  - lancement et annulation de pige
  - solveur deterministe avec contraintes d'exclusion
  - option anti-reciprocite (`noMutualAssignments`)
  - erreurs detaillees si la pige est impossible (`DRAW_IMPOSSIBLE` + details)
- Espace participant public
  - consultation/mise a jour de son profil via lien magique (`/p/:token`)
  - affichage du destinataire une fois la pige effectuee

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

## Previsualisation locale

Previsualiser la version build:

```bash
pnpm preview:web
```

Previsualiser l'API build (si script de preview implemente localement):

```bash
pnpm preview:api
```

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

## Endpoints principaux API

- Sante
  - `GET /health`
- Echanges (admin)
  - `GET /api/exchanges`
  - `POST /api/exchanges`
  - `GET /api/exchanges/:exchangeId`
  - `PUT /api/exchanges/:exchangeId`
  - `DELETE /api/exchanges/:exchangeId`
  - `POST /api/exchanges/:exchangeId/draw`
  - `POST /api/exchanges/:exchangeId/draw/cancel`
- Participants (admin)
  - `GET /api/exchanges/:exchangeId/participants`
  - `POST /api/exchanges/:exchangeId/participants`
  - `PUT /api/exchanges/:exchangeId/participants/:participantId`
  - `DELETE /api/exchanges/:exchangeId/participants/:participantId`
  - `POST /api/exchanges/:exchangeId/participants/:participantId/access/regenerate`
- Exclusions
  - `GET /api/exchanges/:exchangeId/exclusions`
  - `POST /api/exchanges/:exchangeId/exclusions`
  - `DELETE /api/exchanges/:exchangeId/exclusions/:ruleId`
- Espace participant public
  - `GET /api/p/:token`
  - `PUT /api/p/:token`

## Variables d'environnement utiles

### API (`apps/api`)

- `SERVER_PORT`: port HTTP de l'API (defaut: `3000`)
- `PUBLIC_BASE_URL`: base URL publique pour generer les liens participant (`/p/:token`)
- `FRONTEND_BASE_URL`: fallback si `PUBLIC_BASE_URL` est absent

### Web (`apps/web`)

- `VITE_API_BASE`: base URL de l'API (recommande de la definir explicitement, voir `apps/web/.env.example`)

## Notes

- Le stockage actuel cote API est en memoire (repositories in-memory), adapte au dev/tests.
- Le package `@kado/shared` centralise les contrats pour garder le front et le back synchronises.
- Au demarrage de l'API, des donnees de test sont chargees automatiquement depuis `apps/api/src/test-data.json` via `load-test-data.ts`.
