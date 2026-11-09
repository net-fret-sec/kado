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

Le suivi reste exclusivement côté serveur. Aucun compteur navigateur, cookie de
traçage ou identifiant de visiteur n'est ajouté. L'ancien POST `/api/page-views`
reste une réponse 204 sans stockage pour les très anciens clients.

Les compteurs Caddy internes restent la référence de volume (port 2019 non
publié, HEAD exclus). En complément, `monitor.Caddyfile` classe chaque demande
avant réécriture : accueil, organisation, participation, fichiers, API, technique
ou autre. Le journal d'accès est filtré **avant écriture** : uniquement `ts`,
`category`, `method`, `status`, `navigation`. Aucun chemin, paramètre, IP, jeton,
référent, cookie ou user-agent n'y figure. Les en-têtes Fetch Metadata servent
uniquement à produire un booléen; ils ne prouvent pas une visite humaine et
peuvent être absents, notamment après passage par le service worker.

Le spool privé est `/var/lib/kado-monitor/access` (700; fichiers 600), monté dans
Caddy. Rotation horaire et à 1 MiB, au maximum 23 archives + le fichier actif;
les fichiers fermés sont supprimés dès leur import réussi. Limite temporelle de
24 h en fonctionnement normal. Un serveur arrêté ne peut pas purger : la purge
reprend au démarrage. Le spool et la base de surveillance sont hors des dumps
PostgreSQL. Le collecteur refuse les schémas inattendus, ne recopie jamais une
ligne rejetée, et conserve seulement des agrégats et des curseurs techniques.

Le minuteur collecte toutes les minutes, avec verrou commun au relevé manuel.
L'import et les positions de lecture sont transactionnels; les rotations sont
reconnues par fichier, et une troncature ou disparition est signalée. SQLite
conserve sept jours de détails par minute et 90 jours de totaux horaires. La
migration ajoute des tables sans supprimer l'ancien historique. Les heures UTC
évitent les collisions au changement d'heure; l'affichage utilise Toronto.
Les instantanés horaires des échanges restent des états, pas des événements.

L'indicateur d'accueil additionne les réponses **GET 200 et GET 304** de `/` et
`/index.html`, avec distinction entre HTML transmis et cache revalidé. Les
préchargements, robots, rafraîchissements et vos essais peuvent contribuer à ces
chiffres. Les routes inconnues ne deviennent pas des accueils malgré le fallback
SPA. Les sondes HEAD ne contribuent pas aux demandes classées.

L'accueil utilise désormais le réseau en priorité et revalide le HTML. Après
3 secondes, hors ligne ou en erreur serveur, le shell précaché peut être servi.
Les fichiers restent en cache. Les autres routes, les restaurations d'onglets,
la navigation interne et les anciens service workers peuvent éviter le réseau.
On ne mesure donc **ni visiteurs uniques ni toutes les pages vues**.

Le rapport JSON version 2 garde les champs existants et ajoute `traffic` :
`collectionStartedAt`, `sampledAt`, `available`, `stale`, les quatre `periods`,
leurs bornes et qualité, puis `comparison`. `--history` ajoute `hours` et
`businessSnapshots`, ainsi que les heures de bord limitées à chaque fenêtre. Les fenêtres 24 h/7 j sont à la minute; 30/90 j sont à
l'heure, avec bornes explicites. Une période sans mesure utilisable est `null`.
La comparaison utilise les heures entières sans interruption communes aux deux
sources; de petits écarts restent possibles aux frontières des relevés, car les
compteurs Caddy sont relevés périodiquement. Ce n'est pas une validation du
nombre de personnes. Pas de reconstruction des anciennes catégories.

```bash
pnpm status:prod
pnpm --silent status:prod --json --history
pnpm --silent status:prod --json --history --read-only
pnpm monitor:prod
```

La dernière commande construit l'interface locale et donne son adresse
`http://127.0.0.1:4317`. Il faut installer les dépendances avec `pnpm install
--frozen-lockfile` après mise à jour du code. Le tableau utilise l'alias SSH
`netfretsec`, un accès non interactif et des lectures seules. Il n'expose aucun
nouvel accès sur le VPS. `KADO_MONITOR_PORT` change le port local;
`KADO_MONITOR_SSH_CONFIG` permet un autre fichier SSH (par défaut `~/.ssh/config`
s'il existe). Aucun mot de passe ni clé privée n'est transmis au navigateur.

La vue actualise son bilan chaque minute, garde en mémoire le dernier résultat
si SSH échoue et le marque périmé. La lecture seule ne migre pas SQLite, ne
modifie pas les permissions, ne lance pas de sondes et ne recalcule pas de
compteurs sur le serveur. Le minuteur reste responsable de la collecte. Un
relevé vieux de plus de trois minutes est périmé. Les graphiques et le CSV
exposent les heures incomplètes, et les tableaux offrent un accès clavier.
L'interface n'utilise aucune ressource ni police distante.

Le statut conserve ses codes 0 (contrôles techniques satisfaits), 1 (bilan avec
problème technique) et 2 (bilan impossible). Le tableau accepte le JSON d'un code
1 et affiche les problèmes; une perte d'accès SSH ne devient pas une période
sans trafic. La qualité du journal classé est affichée séparément.

Validation et livraison : voir [MONITORING.md](MONITORING.md).

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
