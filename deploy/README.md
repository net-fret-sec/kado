# Déploiement production sur VPS

Ce dossier contient la stack de déploiement production de Kado pour un VPS unique avec HTTPS, Caddy, PostgreSQL et une API interne au réseau Docker.

## Architecture cible

- `caddy`: terminaison TLS, service des assets web et proxy `/api`.
- `api`: serveur Node.js/Express exposé uniquement au réseau Docker.
- `db`: PostgreSQL 16 avec volume persistant.

## Prérequis VPS

Système recommandé:

- Ubuntu 24.04 LTS ou Debian 12.

Paquets et services attendus:

- Docker Engine.
- Docker Compose plugin.
- `ufw`.
- `fail2ban`.

Ports à ouvrir:

- `22/tcp`
- `80/tcp`
- `443/tcp`

## DNS

Créer un enregistrement A pointant le sous-domaine voulu vers l'IP publique du VPS, puis attendre la propagation avant le premier démarrage afin que Let's Encrypt puisse émettre le certificat.

## Préparation des variables

Depuis la racine du dépôt:

1. Copier les variables Compose:

```bash
cp deploy/.env.production.example deploy/.env.production
```

2. Renseigner au minimum dans `deploy/.env.production`:

- `DOMAIN`
- `ACME_EMAIL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `VITE_DONATION_URL` si vous voulez afficher le bloc de soutien sur l'accueil

3. Copier les variables API:

```bash
cp deploy/env/api.env.example deploy/env/api.env
```

4. Renseigner dans `deploy/env/api.env`:

- `SERVER_ADDRESS`
- `SERVER_PORT`
- `FRONTEND_BASE_URL`
- `FRONTEND_ALLOWED_ORIGINS`
- `PARTICIPANT_ACCESS_RATE_WINDOW_MS`
- `PARTICIPANT_ACCESS_RATE_SOFT_LIMIT`
- `PARTICIPANT_ACCESS_BASE_DELAY_MS`
- `PARTICIPANT_ACCESS_MAX_DELAY_MS`

Exemple typique:

- `FRONTEND_BASE_URL=https://kado.exemple.com`
- `FRONTEND_ALLOWED_ORIGINS=https://kado.exemple.com`
- `PARTICIPANT_ACCESS_RATE_WINDOW_MS=10000`
- `PARTICIPANT_ACCESS_RATE_SOFT_LIMIT=10`
- `PARTICIPANT_ACCESS_BASE_DELAY_MS=200`
- `PARTICIPANT_ACCESS_MAX_DELAY_MS=1500`

La variable `DATABASE_URL` n'est pas à définir dans `deploy/env/api.env`: elle est injectée par Compose vers le service `api` à partir des variables PostgreSQL du fichier `deploy/.env.production`.

## Premier déploiement

Commande recommandée:

```bash
bash deploy/scripts/release.sh
```

Ou avec un fichier d'environnement alternatif:

```bash
bash deploy/scripts/release.sh deploy/.env.production
```

Le script effectue les étapes suivantes:

1. Build des images avec `docker compose build --pull`.
2. Démarrage de PostgreSQL.
3. Exécution des migrations SQL via le conteneur API.
4. Démarrage de l'API et de Caddy.
5. Affichage de l'état des services.

## Vérification post-déploiement

Vérifier la santé API:

```bash
curl -fsS https://votre-domaine/health
```

Vérifier la page web:

```bash
curl -I https://votre-domaine
```

Vérifier l'état Compose:

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml ps
```

## Sauvegardes PostgreSQL

Backup manuel:

```bash
bash deploy/scripts/backup-db.sh
```

Backup dans un dossier spécifique:

```bash
bash deploy/scripts/backup-db.sh deploy/.env.production /var/backups/kado
```

Restauration depuis un dump:

```bash
bash deploy/scripts/restore-db.sh deploy/.env.production /var/backups/kado/kado-YYYYMMDD-HHMMSS.dump
```

À prévoir en exploitation:

- conserver une copie des backups hors VPS,
- tester régulièrement une restauration complète,
- surveiller l'espace disque et la date du dernier dump réussi.

## Opérations courantes

Logs Caddy:

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml logs -f caddy
```

Logs API:

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml logs -f api
```

Redémarrer l'API:

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml restart api
```

Arrêter la stack:

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml down
```

## Notes techniques

- Le frontend est build dans l'image Caddy et servi statiquement.
- Caddy route `/api` vers `api:3000` à l'intérieur du réseau Docker.
- Le healthcheck du service `api` cible `http://127.0.0.1:3000/health`.
- Les certificats Let's Encrypt sont persistés dans `caddy_data`.
- Les données PostgreSQL sont persistées dans `db_data`.

## Durcissement recommandé

- SSH par clé uniquement.
- `fail2ban` actif.
- mises à jour de sécurité automatiques.
- rotation régulière des secrets.
- surveillance simple sur expiration certificat, échec backup et indisponibilité de service.
