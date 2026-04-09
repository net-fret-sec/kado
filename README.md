# Kado

Kado est une application web libre pour organiser simplement des échanges de cadeaux (type "Secret Santa") entre amis, famille ou collègues.

L'objectif est de retirer toute la friction liée à l'organisation: règles, contraintes, tirage et communication, tout en restant simple, fiable et sans inscription obligatoire.

## Philosophie du projet

Kado est conçu comme un outil:

- simple à utiliser, sans friction inutile
- respectueux de la vie privée (liens personnels, pas de compte requis)
- transparent dans son fonctionnement (code source ouvert)
- maintenu de manière indépendante

Le projet est libre et peut être utilisé, modifié ou auto-hébergé.

Le dépôt est un monorepo PNPM composé de 3 briques:

- `apps/api`: API HTTP Node.js/Express (logique métier)
- `apps/web`: application Vue 3 (interface admin + participant)
- `packages/shared`: contrats partagés (DTO, types, schémas Zod)

## Ce que l'application règle

- Centraliser l'organisation d'un échange de cadeaux.
- Éviter les erreurs de pige (auto-attribution, conflits de contraintes).
- Gérer automatiquement des règles complexes (exclusions, anti-réciprocité).
- Donner un accès simple aux participants via un lien personnel (`/p/:token`).
- Fournir des explications claires lorsque le tirage est impossible.
- Garder front et back synchronisés grâce à un package de types commun.

## Nouveautés / bonifications récentes

- Ajout du mode anti-réciprocité via `noMutualAssignments`.
- Gestion des règles d'exclusion entre participants (API + UI admin).
- Verrouillage de l'édition des exclusions quand l'échange est `drawn` ou `archived`.
- Erreurs de pige enrichies quand aucune solution n'est possible:
  - code `DRAW_IMPOSSIBLE`
  - détails: `hasExclusionRules`, `noMutualAssignments`
- Parcours public participant confirmé et stabilisé sur `GET/PUT /api/p/:token`.
- Vue de détail d'échange bonifiée côté web (gestion des exclusions par participant).

## Soutenir le projet

Kado est un projet libre, maintenu bénévolement.

Si l'application vous a été utile pour organiser un échange, vous pouvez contribuer à son maintien:

-> [Soutenir le projet](#)

(Aucune fonctionnalité n'est bloquée: la contribution est entièrement volontaire.)

## Architecture

```text
kado/
|- apps/
|  |- api/          # Backend Express + logique metier
|  |- web/          # Frontend Vue 3 + Vite
|- packages/
   |- shared/       # DTO, schémas Zod, types partagés
```

## Fonctionnalités couvertes

- Gestion des échanges
  - CRUD des échanges
  - statuts: `draft`, `ready`, `drawn`, `archived`
  - options: organisateur, budget, date, mot de passe admin, `noMutualAssignments`
- Gestion des participants (admin)
  - CRUD participants
  - régénération de lien d'accès
- Gestion des exclusions
  - ajout/suppression de règles entre participants
- Pige
  - lancement et annulation
  - solveur déterministe avec contraintes
  - détails explicites en cas d'échec de la pige
- Espace participant public
  - consultation/mise à jour de son profil via lien magique
  - affichage du destinataire après pige

## Stack technique

- Runtime/langage: Node.js, TypeScript, PNPM workspaces
- API: Express 5, Zod, Helmet, CORS, Morgan, Jest, Supertest
- Web: Vue 3, Vite, Pinia, Vue Router, Vue I18n, Bootstrap, vite-plugin-pwa
- Qualité: ESLint, Oxlint, Prettier

## Prérequis

- Node.js: `^20.19.0 || >=22.12.0`
- PNPM: `10.x`

## Installation

Depuis la racine:

```bash
pnpm install
```

## Développement local

Dans 2 terminaux:

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

Par défaut:

- API: `http://localhost:3000`
- Web: `http://localhost:5173`

## Build et vérification

Build web:

```bash
pnpm build:web
```

Build API:

```bash
pnpm build:api
```

Preview web (build):

```bash
pnpm preview:web
```

Tests API:

```bash
pnpm --dir apps/api test
```

Lint web:

```bash
pnpm --dir apps/web lint
```

Note: `pnpm preview:api` existe à la racine, mais le script `preview` n'est pas défini dans `apps/api` pour le moment.

## Endpoints API principaux

- Santé
  - `GET /health`
- Échanges (admin)
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

### API (`apps/api/.env`)

- `SERVER_ADDRESS`: adresse d'écoute loggée (défaut: `http://0.0.0.0`)
- `SERVER_PORT`: port HTTP (défaut: `3000`)
- `FRONTEND_BASE_URL`: base URL du front pour construire les liens participant
- `FRONTEND_ALLOWED_ORIGINS`: liste CSV d'origines autorisées pour CORS (optionnel)
- `PUBLIC_BASE_URL`: prioritaire sur `FRONTEND_BASE_URL` si définie

Exemple: `apps/api/.env.example`

### Web (`apps/web/.env`)

- `VITE_API_BASE`: base URL de l'API. Laisser vide pour utiliser le meme host/port que le frontend (proxy Vite en dev). Exemple explicite possible: `http://localhost:3000`

Exemple: `apps/web/.env.example`

## Limites actuelles

- Le stockage API est en mémoire (pas de base de données persistante).
- Les données de démo sont chargées au démarrage depuis `apps/api/src/test-data.json`.

## Licence

Projet publié sous licence AGPL v3.

Cela signifie que:

- vous pouvez utiliser, modifier et redistribuer le code librement
- toute modification exposée via un service web doit rester accessible publiquement

Le but est de garantir que Kado reste un bien commun, même lorsqu'il est hébergé en ligne.
