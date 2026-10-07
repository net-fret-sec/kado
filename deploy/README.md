# Livraison manuelle sur un VPS

Kado utilise PostgreSQL 16, une API Node compilée et Caddy pour HTTPS et les fichiers web. L’API et PostgreSQL n’exposent aucun port public. Une seule instance API est prise en charge : les quotas et le worker de pige sont locaux au processus.

## Préparer une version

La CI vérifie les tests sur une base éphémère, TypeScript, les builds, les lints, les scripts, les images derrière Caddy et une restauration. Elle fournit un artefact `kado-<SHA>` contenant `images.tar.gz`, `version` et `SHA256SUMS`. Les images sont construites hors VPS. Un build local équivalent sur un commit propre est disponible avec `pnpm release:bundle` (Docker, Python 3 et navigateur Playwright requis).

Les sommes de contrôle détectent la corruption ; elles ne constituent pas une signature. Télécharger le bundle depuis le workflow de confiance et vérifier le commit et son résultat. Les pull requests ne déclenchent aucun déploiement. Le mécanisme précédent de mise à jour par Git est désactivé.

## Configuration et installation

1. Préparer un VPS Ubuntu/Debian avec Docker Compose, Python 3, `flock`, SSH par clé et un pare-feu autorisant seulement les ports nécessaires (SSH, 80, 443).
2. Installer les fichiers `deploy/` de la version validée, sans secrets provenant du dépôt.
3. Copier `deploy/.env.production.example` vers `deploy/.env.production` et `deploy/env/api.env.example` vers `deploy/env/api.env`. Protéger les fichiers par des permissions 600. Les fichiers d’environnement de déploiement sont des fichiers shell **de confiance** : ne pas y insérer de contenu non contrôlé.
4. Renseigner domaine, email ACME, identifiants PostgreSQL et `IMAGE_TAG` avec le SHA de l’artefact. Utiliser des noms de base/utilisateur simples, et citer correctement les mots de passe shell. Compose transmet les identifiants via les variables PostgreSQL natives, sans concaténer de mot de passe dans une URL.
5. Définir `FRONTEND_BASE_URL` et `FRONTEND_ALLOWED_ORIGINS` avec les origines HTTPS exactes. Compose impose `TRUST_PROXY_HOPS=1` ; ne pas exposer directement l’API, ni ajouter un second proxy sans revoir cette configuration.
6. Placer le bundle vérifié dans un répertoire privé, puis exécuter :

```bash
bash deploy/scripts/release.sh deploy/.env.production /chemin/bundle
```

Le script acquiert un verrou commun aux opérations de base, vérifie l’archive, sauvegarde la base existante, charge les images, applique les migrations et attend la santé de l’API. Aucun reset ni restauration automatique. Après succès, conserver le SHA retourné dans `IMAGE_TAG` du fichier de configuration pour les opérations suivantes.

La migration `002_organizer_name.sql` est additive : elle ne requalifie aucun ancien organisateur. Appliquer les migrations par le script de livraison ; ne pas rejouer les fichiers SQL manuellement.

## Sauvegarde et restauration

Sauvegarde manuelle :

```bash
bash deploy/scripts/backup-db.sh deploy/.env.production /var/backups/kado
```

Le dump est privé, écrit temporairement, vérifié par `pg_restore --list`, puis renommé. Un échec conserve les sauvegardes précédentes. Après un succès, la rotation conserve le dernier dump de chacun des 14 jours ayant une sauvegarde. Cela ne garantit pas 14 jours consécutifs si des sauvegardes ont échoué.

Les unités dans `deploy/systemd/` préparent une sauvegarde quotidienne à 04:00, avec rattrapage après arrêt. Adapter `/opt/kado`, le compte et les chemins, puis installer explicitement les unités sur le VPS. Elles ne sont pas installées par les scripts. Surveiller les échecs avec `systemctl status kado-backup.service` et `journalctl -u kado-backup.service`, la date du dernier dump, sa taille et l’espace disponible.

Restauration volontaire :

```bash
bash deploy/scripts/restore-db.sh deploy/.env.production /var/backups/kado/kado-....dump
```

Le dump doit être valide et de confiance. La confirmation `RESTORE_KADO` est obligatoire. Le script arrête l’API, termine les connexions à la base, recrée la base et restaure avec arrêt au premier échec. Il ne redémarre l’API qu’après restauration réussie et vérifie sa santé. En cas d’échec, l’API reste arrêtée pour inspection.

Un dump local ne protège pas contre la perte du VPS. Une copie hors serveur et son test de récupération restent obligatoires avant ouverture publique.

## Diagnostic et récupération

- `/health/live` : processus vivant, sans accès PostgreSQL.
- `/health` : 200 si PostgreSQL répond, 503 sinon ; aucun détail de connexion public.
- `docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml ps` : santé des services.
- Les logs API contiennent identifiant de requête, route normalisée, statut et durée, sans corps ni secrets. Les logs Docker sont bornés à 3 fichiers de 10 Mio par service.
- Si une migration ou un démarrage échoue : lire les logs, conserver la sauvegarde pré-migration et inspecter le schéma avant toute action. Une migration peut avoir été validée même si le démarrage suivant échoue.
- Pour revenir aux anciennes images, vérifier d’abord qu’elles sont compatibles avec le schéma actuel. Charger leur bundle et changer `IMAGE_TAG`, puis démarrer ces images. Aucune rétrogradation automatique de schéma.
- Une restauration de la sauvegarde pré-migration remplace les données : elle demande une décision explicite et la procédure ci-dessus. Ne jamais restaurer simplement parce qu’un contrôle de santé échoue.

## Vérifications reproductibles

```bash
pnpm --dir apps/api test
pnpm test:web
pnpm build:api
pnpm build:web
pnpm lint:check
pnpm test:operations
pnpm exec playwright install chromium
# Après construction des deux images locales :
KADO_IMAGE_TAG=p1-local pnpm release:smoke
```

Le smoke test crée un projet Compose unique, des données synthétiques et des volumes éphémères. Il teste le proxy, les quotas IP, les parcours API et navigateur, le dump/restauration, l’arrêt propre et l’indisponibilité PostgreSQL. Il supprime sa stack et ses volumes en fin de test ; il ne lit pas les fichiers secrets ni la base locale de développement.

La validation navigateur P2 est incluse dans le smoke test, sur la même stack éphémère, avec des fixtures distinctes et remise à zéro des compteurs en mémoire entre fixtures. Elle teste aussi les conflits, sessions, erreurs réseau, commandes clavier et contrôles axe. Le mode `pnpm test:e2e` construit les images si aucun `KADO_IMAGE_TAG` n’est fourni. Les captures peuvent être conservées avec `KADO_E2E_OUTPUT=/chemin/absolu`. Ces tests n’installent rien sur le VPS et n’utilisent aucune base existante.
