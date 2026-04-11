# apps/web

Frontend Vue 3 de Kado.

Cette application couvre trois surfaces:

- Vue admin d'un echange (`/exchanges/:id`)
- Vue publique d'un echange (`/x/:id`)
- Espace participant via lien magique (`/p/:token`)

## Stack

- Vue 3 + Vite
- TypeScript
- Vue Router
- Pinia
- Vue I18n
- Bootstrap + Bootstrap Icons

## Locales supportees

- `fr-CA`
- `en-CA`

## Routes principales

- `/` accueil
- `/exchanges` liste admin
- `/exchanges/:id` detail admin
- `/x/:id` vue publique
- `/p/:token` espace participant

## Authentification frontend

- Session admin stockee cote client par echange (Pinia + localStorage)
- Les appels admin envoient `Authorization: Bearer <token>`
- Re-auth admin demandee automatiquement si session invalide/expiree

## Variables d'environnement

- `VITE_API_BASE`: base URL de l'API

Si vide, le frontend utilise les chemins relatifs (`/api/...`) avec le proxy Vite en dev.

## Demarrage local

Depuis la racine du monorepo:

```bash
pnpm dev:web
```

Ou depuis `apps/web`:

```bash
pnpm dev
```

## Verification

```bash
pnpm --dir apps/web lint
pnpm --dir apps/web build
```
