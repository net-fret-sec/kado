# apps/web

Frontend Vue 3 de Kado.

L'application couvre trois surfaces utilisateur:

- Vue admin d'un échange sur `/exchanges/:id`.
- Vue publique d'un échange sur `/x/:id`.
- Espace participant via lien magique sur `/p/:token`.

## Stack

- Vue 3.
- Vite.
- TypeScript.
- Vue Router.
- Pinia.
- Vue I18n.
- Bootstrap et Bootstrap Icons.
- vite-plugin-pwa.

## Routes principales

- `/`: accueil.
- `/exchanges`: liste admin.
- `/exchanges/:id`: détail admin.
- `/x/:id`: vue publique.
- `/p/:token`: espace participant.

## Locales supportées

- `fr-CA`
- `en-CA`

## Comportements utiles à connaître

- Le code participant peut être saisi avec ou sans séparateurs; l'API normalise les variantes.
- Les liens d'accès participant sont construits côté frontend à partir de l'origine du navigateur, même si l'API retourne seulement un chemin relatif.
- La session admin est stockée côté client par échange via Pinia et localStorage.
- Les appels admin transmettent `Authorization: Bearer <token>`.
- Une ré-auth est demandée automatiquement si le token de session n'est plus valide.

## Variables d'environnement

Fichier d'exemple: `apps/web/.env.example`

- `VITE_API_BASE`: base URL de l'API. Si vide, le frontend utilise les chemins relatifs `/api/...` et le proxy Vite en développement.
- `VITE_DONATION_URL`: URL publique du lien de soutien affiché sur l'accueil. Si vide ou absente, le bloc n'est pas rendu.
- `VITE_ADMIN_LINK_CONTINUE_COUNTDOWN_SECONDS`: délai (en secondes) avant activation du bouton "Continuer" après la création d'une pige. Valeur par défaut: `5`.

## Développement local

Depuis la racine du monorepo:

```bash
pnpm dev:web
```

Ou depuis `apps/web`:

```bash
pnpm dev
```

Par défaut, Vite écoute sur `http://localhost:5173` et proxifie `/api` vers `http://localhost:3000`.

## Vérification

```bash
pnpm --dir apps/web type-check
pnpm --dir apps/web lint
pnpm --dir apps/web build
```
