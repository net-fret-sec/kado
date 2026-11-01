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

## Bilan des échanges en production

Depuis le VPS, dans `/opt/kado` :

```bash
bash deploy/scripts/status.sh
# Sortie structurée, facultative :
bash deploy/scripts/status.sh --json
```

Depuis le dossier du projet sur ton ordinateur :

```bash
pnpm status:prod
# Sortie structurée, facultative :
pnpm status:prod --json
```

Cette commande utilise l’alias SSH `netfretsec` pour lancer le script installé
sur le VPS. Pour obtenir du JSON sans les messages de pnpm :
`pnpm --silent status:prod --json`.

Le bilan donne les échanges présents, actifs avec ou sans pige, archivés,
les actifs sans date de remise ou avec au moins trois participants, les nombres
de participants et de suggestions des échanges actifs, puis les créations
encore présentes sur les dernières 24 heures, 7 jours et 30 jours.

« Actif » signifie **non archivé**, pas « récemment visité ». La règle est celle
de l’application : archivage à minuit, 31 jours calendaires après la date de
remise, dans `EXCHANGE_TIME_ZONE`. Un échange sans date de remise reste actif.
Les participants retirés sont exclus des compteurs de participants/suggestions.
Les échanges supprimés ne sont plus mesurables ; ce bilan n’est pas un historique.
Les fenêtres de création sont glissantes (24, 168 et 720 heures).

Le bilan lit les données des échanges dans une transaction PostgreSQL en lecture
seule, avec des délais limités. Si l’API ou la base est indisponible, il présente
quand même l’état des services et signale explicitement l’absence de ces données.
En JSON, `exchanges` et `activeExchanges` sont alors `null`, jamais remplacés par zéro.
Un autre fichier Compose peut être passé en premier argument.

## Surveillance serveur, sans suivi des visiteurs

Le compteur navigateur est retiré. La migration `006_remove_page_views.sql`
supprime uniquement ses deux anciennes tables ; les échanges sont conservés.
L’ancien POST `/api/page-views` renvoie encore 204 sans stocker de pages pour les
clients en cache (cela reste une requête HTTP dans les totaux serveur). Il n’y a plus de requête de télémétrie dans le nouveau navigateur.

Caddy expose ses compteurs uniquement sur son interface d’administration interne
`127.0.0.1:2019/metrics` (port non publié). Aucun journal d’accès détaillé n’est
activé. Le collecteur ne conserve que la somme de trois compteurs du seul handler
externe `subroute` qui enveloppe le site à domaine configuré : réponses terminées, réponses 4xx et réponses 5xx. Ne jamais
additionner les handlers : une requête en traverse plusieurs. Les métriques
brutes ne sont pas écrites sur disque ; ni IP, URI, paramètres, jetons, noms,
référents, méthodes HTTP libres ou identifiants visiteurs ne sont conservés.

`kado-monitor.timer` exécute une collecte toutes les minutes ; `status:prod`
effectue aussi un relevé frais. Le collecteur vérifie en HTTPS, par HEAD, le statut et le type de contenu de
l’accueil (`/`), du processus API (`/health/live`) et de la base via l’API (`/health`).
Les requêtes HEAD, y compris ces sondes, sont exclues des mesures d’activité.
Les sondes ne valident pas le rendu JavaScript ; la recette navigateur le fait à la livraison. Les requêtes
API, fichiers, robots et rafraîchissements automatiques sont inclus ; ce ne sont
ni des pages vues ni des visiteurs uniques. Une page uniquement en cache ne
produit pas de requête serveur. DNT/GPC ne modifient pas ces totaux techniques.

L’historique de totaux par minute et de résultats de sondes est dans
`/var/lib/kado-monitor/monitor.sqlite3` (dossier 700, fichier 600), hors des dumps
PostgreSQL et sans interface publique. Rétention de 7 jours, purge à chaque
relevé avec effacement sécurisé SQLite. Un serveur arrêté ne peut pas purger ;
la purge reprend au prochain relevé. Seuls la date initiale et le point de
référence récent du compteur cumulatif sont conservés pour calculer les écarts.
Les tables de l’ancien compteur restent exclues des dumps pré-migration.

La première collecte établit une référence sans inventer d’historique. Les
écarts sont affectés à la minute du relevé (résolution d’environ une minute).
Les coupures de plus de 3 minutes entraînent une nouvelle référence : leur
trafic n’est pas attribué artificiellement à une minute récente. Une reprise
Caddy peut perdre la fin de la minute précédente ; ruptures, reprises, minutes
manquantes et échecs de collecte sont affichés. Ce bilan n’est pas un engagement
de disponibilité ni une alerte externe. Un VPS inaccessible ne peut pas produire
son propre bilan ; l’échec SSH reste visible.

Le statut comprend aussi l’état des conteneurs et l’état de la sauvegarde :
fichier non vide de moins de 36 heures, minuteur actif et résultat du dernier
travail. Le dump a été vérifié lors de sa création ; aucun test de restauration
n’est prétendu à chaque relevé. Code de sortie du bilan : 0 si les contrôles
actuels sont bons, 1 si dégradés/incomplets (avec rapport), 2 si aucun rapport
ne peut être produit. Une collecte planifiée enregistre les sondes en échec
sans s’interrompre pour autant.

Installation initiale du collecteur sur le VPS après la livraison :

```bash
install -m 644 deploy/systemd/kado-monitor.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now kado-monitor.timer
systemctl start kado-monitor.service
```

Variables pour une installation différente ou une recette isolée :
`KADO_MONITOR_DIR`, `KADO_MONITOR_URL`, `KADO_BACKUP_DIR`, `KADO_COMPOSE_FILE`.
Le script n’installe pas les unités tout seul. Le contrôle s’exécute sur l’hôte
(Python 3 avec SQLite, `docker`, `systemctl`), même quand les conteneurs sont arrêtés.

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

## Images de suggestions

Le [guide images](IMAGES.md) détaille la migration de purge `003_suggestion_images.sql`, ses précautions et les quotas. Les images sont incluses dans les dumps PostgreSQL existants ; surveiller la croissance du disque, du WAL et des sauvegardes. La validation éphémère inclut une restauration réelle des contenus WebP.
