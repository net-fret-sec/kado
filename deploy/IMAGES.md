# Images des suggestions de cadeaux

Chaque suggestion comporte `title`, `linkUrl?`, `imageId?`. Le lien cadeau reste HTTP/HTTPS ; l’image facultative est téléversée, jamais intégrée au JSON. Les sélecteurs d’icônes et les anciennes URLs d’images ont été retirés des suggestions. Les icônes générales, thèmes, palettes et polices restent inchangés.

## Parcours et confidentialité

La sélection montre un aperçu local et garde le fichier uniquement en mémoire. « Enregistrer » téléverse les nouvelles images **séquentiellement**, puis enregistre la liste complète avec `expectedUpdatedAt`. Les images déjà téléversées restent dans le brouillon après une erreur ou un conflit et ne sont pas envoyées de nouveau lors d’une nouvelle tentative explicite. Une interruption réseau peut laisser une image temporaire côté serveur. Aucun retry automatique. Un brouillon ouvert plus de 24 heures peut devoir sélectionner de nouveau une image dont la référence temporaire a expiré.

Une sélection invalide conserve l’image précédente. Le remplacement ou la suppression prend effet seulement après l’enregistrement. `wishlist: []` permet désormais de supprimer la dernière suggestion ; les autres contrats d’effacement facultatif restent inchangés. La liste complète reste un champ unique dans la comparaison de conflits.

Les fichiers ne sont accessibles qu’après vérification de la session organisateur ou du lien participant, sous le verrou de l’échange. Le participant peut lire ses images, ainsi que les images **enregistrées** de la personne actuellement pigée. La vue publique ne contient aucune référence personnelle. Une image temporaire est réservée à son propriétaire et à l’organisateur. Aucun endpoint par identifiant seul. Les lectures privées sont `no-store`, `image/webp`, `nosniff`, chargées à la demande en URLs `blob:` ; les lectures inutiles sont annulées et les URLs libérées. Aucune image personnelle dans le stockage navigateur ou le cache PWA. Caddy autorise `blob:` uniquement dans `img-src`.

Routes organisateur :

- `POST /api/exchanges/:exchangeId/participants/:participantId/images`
- `GET /api/exchanges/:exchangeId/participants/:participantId/images/:imageId`

Routes participant :

- `POST /api/p/:token/images`
- `GET /api/p/:token/images/:imageId`

POST reçoit exactement un fichier multipart `image` et retourne 201 `{ imageId, width, height, byteSize }`. Les noms et originaux ne sont pas conservés. L’upload respecte les verrouillages après pige et archivage, revérifiés après conversion. Les références étrangères ou expirées font échouer toute la transaction de sauvegarde. Les anciens champs `icon` et `imageUrl` sont désormais refusés par les schémas.

## Limites et exploitation

Sharp 0.35.5 et Multer 2.4.0 sont verrouillés dans le manifeste et le lockfile. Signature, décodage réel et animation sont contrôlés. Les images JPEG, PNG ou WebP fixes sont réorientées, débarrassées de leurs métadonnées et réencodées en WebP qualité 80, sans agrandissement. Les PNG animés sont refusés explicitement, même si le décodeur ne lit que leur première frame. SVG, GIF et HEIC/HEIF sont refusés. [API Sharp](https://sharp.pixelplumbing.com/api-constructor/), [principes OWASP](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

| Variable | Valeur initiale |
| --- | ---: |
| `IMAGE_SOURCE_MAX_BYTES` | 5242880 (5 Mio) |
| `IMAGE_MAX_PIXELS` | 20000000 |
| `IMAGE_MAX_DIMENSION` | 1600 |
| `IMAGE_OUTPUT_MAX_BYTES` | 524288 (512 Kio) |
| `IMAGE_PARTICIPANT_QUOTA_BYTES` | 10485760 (10 Mio) |
| `IMAGE_EXCHANGE_QUOTA_BYTES` | 104857600 (100 Mio) |
| `IMAGE_TOTAL_QUOTA_BYTES` | 2147483648 (2 Gio) |
| `IMAGE_TEMP_TTL_MS` | 86400000 (24 h) |
| `IMAGE_TRANSFORM_TIMEOUT_MS` | 5000 |
| `IMAGE_RECEIVE_TIMEOUT_MS` | 10000 |
| `IMAGE_UPLOAD_RATE_LIMIT` | 20 / minute / IP |

Toutes ces valeurs sont validées au démarrage. La configuration publique transmet formats et limites utiles au formulaire. La limite JSON demeure 256 Kio. Les uploads ont un délai client de 30 secondes ; les autres requêtes restent à 15 secondes. Les erreurs traduites distinguent fichier invalide (400), format refusé (415), taille/quota (413) et saturation/interruption (503).

Un seul upload, incluant réception, conversion en processus enfant et commit, est admis à la fois par instance API, sans file d’attente. La conversion ne bloque pas la boucle de l’API ; le processus est interrompu après le délai et terminé lors de l’arrêt du service. Authentification et limitation interviennent avant la réception multipart. Ce contrôle et la sérialisation des quotas reposent sur l’architecture **à une seule instance API**. Réévaluer ce mécanisme avant un déploiement multi-instance.

Les quotas comptent toutes les images, y compris temporaires et expirées non encore nettoyées. Une image nouvellement envoyée expire après 24 heures ; son attachement rend `expires_at` NULL. Un détachement rétablit une expiration de 24 heures. Nettoyage au démarrage et chaque heure : lots de 100, cycle limité à environ 10 secondes entre transactions, verrou de l’échange et condition d’expiration revérifiée. Une image réattachée n’est pas supprimée. Un échec est journalisé comme `image_cleanup_failed`, sans donnée personnelle ; inspecter les logs et la croissance de la table en cas de quota atteint. La suppression complète d’un participant ou de l’échange supprime ses images en cascade.

Les contenus `bytea` appartiennent à la table `suggestion_images`. Ils sont inclus dans les dumps PostgreSQL existants, sans volume ni stockage externe. Prévoir davantage d’espace pour PostgreSQL, son WAL et les 14 sauvegardes quotidiennes : 2 Gio de contenu ne constituent pas une borne sur la taille totale disque. Surveiller l’espace libre et l’âge du dernier succès. La restauration du dump rétablit contenus, références et dates d’expiration ; les temporaires déjà expirées seront purgées au redémarrage. [Documentation pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html).

## Migration volontaire avec sauvegarde préalable

**`003_suggestion_images.sql` purge irréversiblement les champs `icon` et `imageUrl`.** Les images externes ne sont pas récupérées. Titres, liens, ordre et autres valeurs sont conservés ; les versions des participants concernés sont actualisées pour provoquer un conflit avec les anciens brouillons. Aucun thème ou police n’est modifié. Revenir aux anciennes données nécessite une restauration de sauvegarde ; ne pas simplement rétrograder le code.

L’implémentation et ses tests n’appliquent aucune migration à la base de développement. Avant une application volontaire :

1. Arrêter les écritures / l’API et prévenir les utilisateurs qu’ils devront recharger leurs formulaires.
2. Sauvegarder **la base visée** et vérifier le dump. En environnement Compose, suivre `backup-db.sh` et le [guide d’exploitation](README.md). En local avec `DATABASE_URL` explicitement configurée dans le terminal :

   ```sh
   umask 077
   pg_dump --format=custom --file=kado-before-images.dump "$DATABASE_URL"
   pg_restore --list kado-before-images.dump
   ```

3. Avec l’environnement local correctement configuré, exécuter volontairement `pnpm db:migrate:api`. Le registre des migrations applique uniquement les migrations manquantes. En production, utiliser le parcours de livraison décrit dans le guide, qui sauvegarde avant migration. Ne pas rejouer directement les fichiers SQL.
4. Redémarrer avec la nouvelle version ; vérifier `/health`, la conservation des titres/liens et un ajout, une consultation, un remplacement et une suppression d’image.
5. En cas d’échec, conserver le dump et les logs. Examiner le schéma et utiliser la procédure de restauration explicite ; aucun rollback de données ni reset automatique.

## Vérifications reproductibles

- `pnpm --dir apps/api test` : PostgreSQL 16 éphémère, migration de l’ancien schéma, sécurité et cohérence des images, suites P0/P1 conservées.
- `pnpm test:web` : fichiers en mémoire, aperçu et libération des URLs, validation, upload partiel et reprise explicite, délai client et suite P2.
- `pnpm test:e2e` : images API/Caddy de production, Sharp natif, upload participant et organisateur, CSP, mobile/deux langues, sauvegarde/restauration **réelle des octets WebP**, puis nettoyage intégral de la stack éphémère. `KADO_IMAGE_TAG` réutilise les images CI ; `KADO_E2E_OUTPUT` conserve les captures.

Ces contrôles locaux ne prouvent ni l’exécution réelle de GitHub Actions, ni la capacité du VPS, ni la présence de sauvegardes hors serveur.
