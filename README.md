# Kado

Kado est une application web libre pour organiser des échanges de cadeaux sans compte utilisateur, avec une interface d'administration, une vue publique d'échange et un espace participant par lien magique.

L'objectif du projet est de réduire la friction d'organisation tout en gardant des règles explicites, une pige fiable et un hébergement simple.

## Vue d'ensemble

Le monorepo PNPM contient trois briques:

- `apps/api`: API Express 5 et logique métier.
- `apps/web`: application Vue 3, PWA, vue admin, vue publique et espace participant.
- `packages/shared`: types, DTO et schémas partagés entre front et back.

## Terminologie

- Échange: l'entité principale avec configuration, participants, exclusions et statut.
- Pige: l'opération d'assignation des cadeaux.
- Vue admin: interface protégée par session pour gérer un échange.
- Vue publique: page en lecture seule accessible sans authentification.
- Espace participant: accès individuel via `/p/:token` avec code lisible de type `XXXX-XXXX-XXXX`.

## Fonctionnalités couvertes

- Gestion complète des échanges avec statuts `draft`, `ready`, `drawn` et `archived`.
- Options d'échange incluant budget, date, organisateur, mot de passe admin et anti-réciprocité via `noMutualAssignments`.
- Gestion des participants avec régénération de lien d'accès.
- Gestion des exclusions entre participants depuis l'interface admin.
- Pige déterministe avec contraintes et message d'erreur structuré quand aucune solution n'est possible.
- Espace participant public pour consulter et mettre à jour son profil, puis voir le destinataire après la pige.
- Vue publique d'un échange sur une route distincte de la vue admin.
- Session administrateur par échange avec connexion, déconnexion et changement de mot de passe.

## Évolutions récentes déjà intégrées

- Ajout de l'option `noMutualAssignments` jusqu'au solveur de pige.
- Détails d'erreur de pige enrichis avec `DRAW_IMPOSSIBLE`, `hasExclusionRules` et `noMutualAssignments`.
- Gestion des exclusions directement dans la page de détail admin.
- Liens participant au format lisible avec normalisation côté API.
- Protection anti-énumération sur `GET /api/p/:token` et `PUT /api/p/:token`.
- Construction des URLs participant côté frontend à partir de l'origine navigateur, au lieu d'une URL absolue renvoyée par l'API.

## Stack technique

- Runtime: Node.js, TypeScript, PNPM workspaces.
- API: Express 5, Zod, PostgreSQL, Helmet, CORS, Morgan, Jest, Supertest.
- Web: Vue 3, Vite, Pinia, Vue Router, Vue I18n, Bootstrap, vite-plugin-pwa.
- Qualité: ESLint, Oxlint, Prettier.

## Prérequis

- Node.js `^20.19.0 || >=22.12.0`
- PNPM `10.x`
- PostgreSQL 16 ou compatible pour l'API

## Installation

Depuis la racine du dépôt:

```bash
pnpm install
```

## Démarrage local

1. Copier les fichiers d'environnement:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

2. Démarrer PostgreSQL. Exemple minimal via Docker:

```bash
docker run --name kado-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=kado \
  -p 5432:5432 \
  -d postgres:16
```

3. Définir `DATABASE_URL` dans `apps/api/.env`, puis vérifier la connexion:

```bash
pnpm db:ping:api
```

4. Appliquer les migrations:

```bash
pnpm db:migrate:api
```

5. Lancer l'API et le frontend dans deux terminaux:

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

Par défaut:

- API: `http://localhost:3000`
- Web: `http://localhost:5173`

Le frontend Vite proxifie `/api` vers `http://localhost:3000` en développement si `VITE_API_BASE` est vide.

## Scripts utiles

Depuis la racine:

- `pnpm dev`: lance les workspaces en parallèle.
- `pnpm dev:api`: démarre l'API en watch.
- `pnpm dev:web`: démarre Vite.
- `pnpm build:api`: compile l'API.
- `pnpm build:web`: build du frontend.
- `pnpm preview:web`: sert le build frontend.
- `pnpm db:ping:api`: teste la connexion PostgreSQL.
- `pnpm db:migrate:api`: applique les migrations SQL.
- `pnpm db:reset-db:api`: supprime et recrée le schéma `public`, puis rejoue toutes les migrations.
- `pnpm db:reset-example-passwords:api`: réinitialise les mots de passe admin des échanges d'exemple.
- `pnpm db:reset-exchanges:api`: supprime toutes les données métier d'échange après confirmation explicite.

Note: `pnpm preview:api` existe à la racine mais le script `preview` n'est pas défini dans `apps/api` pour l'instant.

## Vérification locale

- Build API: `pnpm build:api`
- Build web: `pnpm build:web`
- Tests API: `pnpm --dir apps/api test`
- Lint web: `pnpm --dir apps/web lint`
- Type-check web: `pnpm --dir apps/web type-check`

## Variables d'environnement

### API

Fichier d'exemple: `apps/api/.env.example`

- `SERVER_ADDRESS`: adresse d'écoute affichée dans les logs. Défaut: `http://0.0.0.0`.
- `SERVER_PORT`: port HTTP. Défaut: `3000`.
- `FRONTEND_BASE_URL`: URL du frontend, utilisée notamment comme fallback CORS.
- `FRONTEND_ALLOWED_ORIGINS`: liste CSV d'origines CORS autorisées.
- `PARTICIPANT_ACCESS_RATE_WINDOW_MS`: fenêtre glissante de protection anti-abus.
- `PARTICIPANT_ACCESS_RATE_SOFT_LIMIT`: nombre de requêtes tolérées avant augmentation du délai.
- `PARTICIPANT_ACCESS_BASE_DELAY_MS`: délai de base ajouté sur les endpoints participant publics.
- `PARTICIPANT_ACCESS_MAX_DELAY_MS`: plafond du délai progressif.
- `DATABASE_URL`: URL de connexion PostgreSQL.

### Web

Fichier d'exemple: `apps/web/.env.example`

- `VITE_API_BASE`: base URL de l'API. Laisser vide en développement local pour utiliser le proxy Vite.
- `VITE_DONATION_URL`: URL de soutien affichée sur l'accueil. Si vide ou absente, le bloc de soutien n'est pas rendu.
- `VITE_ADMIN_LINK_CONTINUE_COUNTDOWN_SECONDS`: délai (en secondes) avant activation du bouton "Continuer" après la création d'une pige. Valeur par défaut: `5`.

## Endpoints principaux

- Santé
  - `GET /health`
- Échanges admin
  - `GET /api/exchanges`
  - `POST /api/exchanges`
  - `GET /api/exchanges/:exchangeId`
  - `PUT /api/exchanges/:exchangeId`
  - `DELETE /api/exchanges/:exchangeId`
  - `POST /api/exchanges/:exchangeId/draw`
  - `POST /api/exchanges/:exchangeId/draw/cancel`
- Participants admin
  - `GET /api/exchanges/:exchangeId/participants`
  - `POST /api/exchanges/:exchangeId/participants`
  - `PUT /api/exchanges/:exchangeId/participants/:participantId`
  - `DELETE /api/exchanges/:exchangeId/participants/:participantId`
  - `POST /api/exchanges/:exchangeId/participants/:participantId/access/regenerate`
- Exclusions
  - `GET /api/exchanges/:exchangeId/exclusions`
  - `POST /api/exchanges/:exchangeId/exclusions`
  - `DELETE /api/exchanges/:exchangeId/exclusions/:ruleId`
- Auth admin
  - `POST /api/exchanges/:exchangeId/admin/sessions`
  - `DELETE /api/exchanges/:exchangeId/admin/sessions/current`
  - `PUT /api/exchanges/:exchangeId/admin/password`
- Vue publique
  - `GET /api/public/exchanges/:exchangeId`
- Participant public
  - `GET /api/p/:token`
  - `PUT /api/p/:token`

## Scripts de maintenance API

Réinitialiser les mots de passe admin des échanges listés dans `apps/api/src/test-data.json`:

```bash
pnpm db:reset-example-passwords:api
```

Options utiles:

```bash
EXAMPLE_ADMIN_PASSWORD='MonMotDePasse123!' pnpm db:reset-example-passwords:api
EXAMPLE_PASSWORD_TARGET=all pnpm db:reset-example-passwords:api
```

Réinitialiser complètement le schéma local et rejouer les migrations:

```bash
RESET_DB_CONFIRM=RESET_DB pnpm db:reset-db:api
```

À utiliser quand le schéma local ne correspond plus aux migrations actuelles.

Supprimer toutes les données métier d'échange:

```bash
RESET_EXCHANGES_CONFIRM=RESET_EXCHANGES pnpm db:reset-exchanges:api
```

Cette suppression efface en cascade les participants, assignations, exclusions, accès et sessions associés.
Elle ne modifie pas le schéma existant.

## Déploiement production

Une stack Docker Compose avec Caddy, API et PostgreSQL est fournie dans `deploy`.

Voir `deploy/README.md` pour:

- la préparation des variables,
- le script de release,
- les sauvegardes PostgreSQL,
- les opérations courantes sur le VPS.

## Limites actuelles

- PostgreSQL doit être disponible pour que l'API démarre.
- Il n'y a pas encore de stratégie temps réel pour synchroniser l'état côté client.
- Les données d'exemple ne sont pas chargées automatiquement au démarrage.

## Licence

Projet publié sous licence AGPL v3.

Vous pouvez l'utiliser, le modifier et le redistribuer, mais toute version modifiée exposée en service web doit rester disponible publiquement.
