# Deploiement production sur VPS Scaleway

Ce dossier contient une base de deploiement simple et robuste pour exposer Kado sur un seul point d'entree HTTPS avec Caddy et Let's Encrypt.

Architecture cible:
- caddy: reverse proxy TLS et service des assets web
- api: serveur Node/TypeScript (Express)
- db: PostgreSQL

## 1) Prerequis VPS

Systeme recommande:
- Ubuntu 24.04 LTS ou Debian 12

Packages:
- Docker Engine
- Docker Compose plugin
- ufw
- fail2ban

Ports ouverts:
- 22/tcp
- 80/tcp
- 443/tcp

## 2) DNS

Creer un enregistrement A:
- host: kado
- domaine: netfretsec.com
- valeur: IP publique du VPS

Attendre la propagation DNS avant la premiere mise en service TLS.

## 3) Preparation des variables

Depuis la racine du projet:

1. Copier les variables de compose:

cp deploy/.env.production.example deploy/.env.production

2. Editer deploy/.env.production:
- DOMAIN
- ACME_EMAIL
- POSTGRES_PASSWORD

3. Copier les variables API:

cp deploy/env/api.env.example deploy/env/api.env

4. Editer deploy/env/api.env:
- FRONTEND_BASE_URL
- FRONTEND_ALLOWED_ORIGINS
- PUBLIC_BASE_URL
- PARTICIPANT_ACCESS_RATE_WINDOW_MS
- PARTICIPANT_ACCESS_RATE_SOFT_LIMIT
- PARTICIPANT_ACCESS_BASE_DELAY_MS
- PARTICIPANT_ACCESS_MAX_DELAY_MS

Exemple typique:
- FRONTEND_BASE_URL=https://kado.netfretsec.com
- FRONTEND_ALLOWED_ORIGINS=https://kado.netfretsec.com
- PUBLIC_BASE_URL=https://kado.netfretsec.com
- PARTICIPANT_ACCESS_RATE_WINDOW_MS=10000
- PARTICIPANT_ACCESS_RATE_SOFT_LIMIT=10
- PARTICIPANT_ACCESS_BASE_DELAY_MS=200
- PARTICIPANT_ACCESS_MAX_DELAY_MS=1500

Ces variables regissent la temporisation progressive appliquee aux endpoints publics participants (`/api/p/:token`) pour limiter l'enumeration de liens.

## 4) Premier deploiement

Commande unique:

./deploy/scripts/release.sh

Ce script fait:
1. build des images
2. demarrage PostgreSQL
3. migration SQL
4. demarrage API et Caddy
5. affichage de l'etat compose

## 5) Verification post-deploiement

Verifier la sante API:

curl -fsS https://kado.netfretsec.com/health

Verifier la page web:

curl -I https://kado.netfretsec.com

Verifier les services:

docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml ps

## 6) Sauvegardes PostgreSQL

Backup manuel:

./deploy/scripts/backup-db.sh

Backup dans un dossier specifique:

./deploy/scripts/backup-db.sh deploy/.env.production /var/backups/kado

Restore depuis un dump:

./deploy/scripts/restore-db.sh deploy/.env.production /var/backups/kado/kado-YYYYMMDD-HHMMSS.dump

Important:
- conserver une copie hors VPS (Object Storage Scaleway conseille)
- tester la restauration regulierement

## 7) Operations courantes

Voir les logs Caddy:

docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml logs -f caddy

Voir les logs API:

docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml logs -f api

Redemarrer un service:

docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml restart api

Stopper la stack:

docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml down

## 8) Durcissement recommande

- SSH par cle uniquement
- fail2ban actif
- mises a jour de securite automatiques
- rotation des mots de passe et secrets
- verification reguliere de l'espace disque
- monitoring simple sur:
  - expiration certificat
  - echec backup
  - service down

## 9) Notes techniques

- Le web est build dans l'image Caddy et servi statiquement.
- L'API reste interne au reseau Docker, Caddy route /api vers api:3000.
- Les certificats Let's Encrypt sont persistants dans le volume caddy_data.
- Les donnees PostgreSQL sont persistantes dans le volume db_data.
