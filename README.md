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
- Pige aléatoire et bornée avec contraintes et message d'erreur structuré quand aucune solution n'est possible.
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
- API: Express 5, Zod, PostgreSQL, Helmet, CORS, logs structurés, Jest, Supertest.
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

Le frontend Vite proxifie `/api` vers `http://127.0.0.1:3000` en développement si `VITE_API_BASE` est vide.

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
- Tests API: `pnpm --dir apps/api test` (Docker requis ; PostgreSQL 16 éphémère, migrations appliquées, aucun accès implicite à la base locale).
- Lint web sans modification: `pnpm --dir apps/web exec eslint .` puis `pnpm --dir apps/web exec oxlint .`
- Type-check web: `pnpm --dir apps/web type-check`

## Variables d'environnement

### API

Fichier d'exemple: `apps/api/.env.example`

- Écoute API : `0.0.0.0` normalement, `127.0.0.1` avec les outils admin locaux. L’ancienne variable `SERVER_ADDRESS` est ignorée.
- `SERVER_PORT`: port HTTP. Défaut: `3000`.
- `FRONTEND_BASE_URL`: URL du frontend, utilisée notamment comme fallback CORS.
- `FRONTEND_ALLOWED_ORIGINS`: liste CSV d'origines CORS autorisées.
- `PARTICIPANT_RATE_WINDOW_MS`: fenêtre fixe de protection anti-abus.
- `PARTICIPANT_RATE_LIMIT`: nombre de requêtes autorisées avant un refus 429.
- `DATABASE_URL`: URL de connexion PostgreSQL.
- `EXCHANGE_TIME_ZONE`: fuseau IANA validé au démarrage, défaut `America/Toronto`.
- `ENABLE_LOCAL_ADMIN_TOOLS`: `true` pour activer la liste globale uniquement avec `NODE_ENV=development`; défaut désactivé. Le serveur écoute alors exclusivement sur `127.0.0.1` et refuse les requêtes transférées par proxy.

### Web

Fichier d'exemple: `apps/web/.env.example`

- `VITE_ENABLE_LOCAL_ADMIN_TOOLS`: `true` pour activer la page `/exchanges` uniquement en développement ; Vite écoute alors sur `127.0.0.1`. Nécessite aussi le drapeau API. Hors activation, cette route revient à l’accueil et la liste n’est jamais appelée.
- `VITE_API_BASE`: base URL de l'API. Laisser vide en développement local pour utiliser le proxy Vite.
- `VITE_DONATION_URL`: URL de soutien affichée sur l'accueil. Si vide ou absente, le bloc de soutien n'est pas rendu.
- `VITE_ADMIN_LINK_CONTINUE_COUNTDOWN_SECONDS`: délai (en secondes) avant activation du bouton "Continuer" après la création d'une pige. Valeur par défaut: `5`.

## Endpoints principaux

- Santé
  - `GET /health`
- Échanges admin
  - `GET /api/exchanges` (outil local désactivé par défaut, indisponible en production)
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

## Confidentialité et intégrité (P0)

Les sessions admin sont limitées à un échange. Chaque opération individuelle sur un participant filtre simultanément son identifiant et celui de l’échange autorisé. Un participant absent ou extérieur à l’échange produit le même `PARTICIPANT_NOT_FOUND` (404). La vue publique expose uniquement un contrat explicite, sans profils participants ni champs d’administration.

Les mutations utilisent une transaction et verrouillent d’abord la ligne de l’échange. Créations et rotations de liens sont atomiques ; un accès participant est revalidé après acquisition du verrou. Une seconde pige concurrente renvoie la pige déjà réalisée. Avec `revokeExisting=true`, seule la dernière rotation validée reste active ; `false` conserve les accès précédents.

| État | Modifications permises |
|---|---|
| Avant pige, non archivé | Édition habituelle ; l’organisateur référencé doit appartenir à l’échange |
| Tiré, non archivé | Titre, description, budget, date ; souhaits et notes si `lockSuggestionsAfterDraw=false` ; rotation, annulation et suppression complète |
| Archivé | Consultation, rotation des liens et suppression complète |

Après pige, noms et emails, ajout/suppression de participants, organisateur, exclusions et options de pige sont figés. Les mêmes règles de souhaits/notes s’appliquent à l’admin et au participant. Les champs figés envoyés avec leur valeur actuelle sont acceptés. Les refus métier utilisent HTTP 400 avec des codes traduits dans l’interface.

Les dates d’échange sont des dates civiles `YYYY-MM-DD`, validées et affichées sans décalage de fuseau navigateur. Les horodatages sont ISO UTC. L’archivage commence à minuit, dans `EXCHANGE_TIME_ZONE`, 31 jours calendaires après la date d’échange. Sans date, aucun archivage automatique. Modifier la date peut archiver immédiatement un échange ; une archive ne peut pas être réouverte par édition.

La commande de tests crée et supprime son propre conteneur PostgreSQL et utilise un port loopback aléatoire. Les scénarios sont isolés entre tests. Un lancement direct de Jest sans URL de test explicitement fournie est refusé. Aucun reset de la base existante n’est nécessaire pour cette P0 et aucune nouvelle migration SQL n’est requise.

La P0 a ensuite été complétée par les protections et outils d’exploitation P1 ci-dessous. Les tests locaux ne constituent pas une validation du serveur de production.

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

Projet sous licence [GNU AGPL v3 uniquement](LICENSE), identifiant `AGPL-3.0-only`.

Vous pouvez l'utiliser, le modifier et le redistribuer, mais toute version modifiée exposée en service web doit rester disponible publiquement.

## P1 — sécurité et livraison

- Quotas réels (429 et `Retry-After`), compteurs locaux bornés et expirables. Valeurs et fenêtres dans `.env.example` ; ils repartent à zéro au redémarrage. Une seule instance API.
- Limite de 50 participants actifs (`MAX_ACTIVE_PARTICIPANTS`), organisateur non participant sans profil ni accès personnel.
- Pige mélangée avec le générateur cryptographique de Node, sans promesse d’uniformité. Un seul worker ; budget 200 000 nœuds / 2 secondes. Une recherche interrompue est distinguée d’une pige impossible.
- Changer le mot de passe révoque toutes les anciennes sessions. `PUT /api/exchanges/:exchangeId/admin/password` retourne désormais 200 `{ adminSessionToken }` : l’appareil courant stocke ce remplacement.
- Les écritures admin revalident la session sous verrou. Les hashes scrypt existants restent compatibles. Deux calculs de mot de passe simultanés maximum.
- `GET /api/config` expose uniquement `maxActiveParticipants` pour l’interface. `/health` retourne 503 quand la base est indisponible ; `/health/live` vérifie uniquement le processus.
- JSON limité à 256 Kio ; URLs de souhaits HTTP/HTTPS et 2 048 caractères maximum. Les anciennes URLs dangereuses ne sont pas affichées ; images HTTPS uniquement en production.
- CORS explicite en production, absence de cache API, CSP sur le frontend servi par Caddy et aucune transmission du lien participant par Referer.
- La migration additive `002_organizer_name.sql` conserve les anciens échanges. Aucun reset requis.

Démarrage local, après configuration de PostgreSQL et application volontaire des migrations : `pnpm dev`. Outils locaux : `ENABLE_LOCAL_ADMIN_TOOLS=true VITE_ENABLE_LOCAL_ADMIN_TOOLS=true pnpm dev`, puis `/exchanges`. Les deux serveurs écoutent alors sur loopback ; la liste est absente en production.

Les builds API produisent `apps/api/dist/server.cjs`, la migration compilée et le worker. `pnpm --dir apps/api start` utilise Node sans transpilation. En local, `DATABASE_URL` reste supportée ; Compose fournit PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD.

La CI teste et prépare une archive d’images ; aucune mise à jour automatique ni déploiement. Voir [le guide d’exploitation](deploy/README.md) pour installer une version précise et sauvegarder/restaurer. La copie hors VPS et les contrôles du serveur réel restent nécessaires avant publication.

## P2 — parcours, accessibilité et maintenance

Les vues admin s’actualisent toutes les 5 secondes lorsqu’elles sont visibles, sans écriture ni formulaire ouvert. Une panne espace les tentatives à 10, 20, 40 puis 60 secondes et respecte `Retry-After`. Les vues participant et publique se mettent à jour au retour sur l’onglet et avec **Actualiser**, sans polling permanent. Les appels API sont bornés à 15 secondes ; aucune écriture n’est répétée automatiquement. Après une interruption d’écriture, son résultat peut être incertain et doit être vérifié avant une nouvelle tentative.

Les brouillons restent en mémoire pendant les erreurs, conflits et réauthentifications du même échange. Aucun profil ou souhait n’est enregistré comme brouillon sur l’appareil. Une fermeture ou navigation demande confirmation si la saisie n’est pas enregistrée ; après rechargement, elle ne peut pas être récupérée. Un stockage navigateur bloqué conserve les sessions uniquement en mémoire.

Lors d’un conflit, la référence initiale, la saisie et la version serveur sont comparées. Les changements indépendants sont réunis ; les champs modifiés différemment demandent un choix. La liste de souhaits constitue un champ complet. **Préparer le brouillon** utilise la nouvelle version de référence mais n’enregistre rien : une sauvegarde explicite reste nécessaire. Les permissions courantes priment sur les choix du brouillon.

Un ajout de participant présente immédiatement son nouveau lien. **Remplacer le lien** demande confirmation et révoque les anciens liens. Si le logout distant échoue, la déconnexion locale est effectuée sans annoncer une révocation serveur confirmée.

Les souhaits conservent icônes et ordre ; ils peuvent être déplacés au clavier avec **Monter/Descendre**. Les formulaires verrouillés restent en lecture seule. Les pages et modales fournissent labels, annonces, gestion du focus et lien d’évitement. Les vérifications automatisées d’accessibilité ne constituent pas une certification complète.

### Vérifier les changements

```bash
pnpm test:web
pnpm lint:check
pnpm test:e2e
```

`test:web` exécute les tests Vitest des formulaires et composables. `test:e2e` construit les images locales et lance une stack Compose éphémère avec PostgreSQL 16, HTTPS/Caddy, Playwright et axe ; elle ne cible pas la base de développement. Avec `KADO_IMAGE_TAG`, elle réutilise des images déjà construites. Définir `KADO_E2E_OUTPUT` avec un chemin absolu pour conserver les captures synthétiques. Docker Compose et Chromium Playwright sont requis (`pnpm exec playwright install chromium`).

La CI exécute ces vérifications frontend et les scénarios navigateur pendant la fabrication des images, sans second build. Un résultat local et un résultat GitHub Actions sont distincts : le workflow n’est validé sur GitHub qu’après son exécution réelle.

### Compléments reportés

L’effacement explicite des champs facultatifs (description, date, budget, notes, liste complète de souhaits) n’a pas été normalisé dans cette P2. Les contrats actuels restent inchangés : selon le champ et sa sérialisation, une valeur vidée peut être omise et laisser la valeur existante intacte. Cette limitation demande un lot séparé, sans migration ou réécriture de données dans la P2.

Les sauvegardes hors VPS et la validation du serveur réel restent nécessaires avant ouverture publique.
