# Surveillance Kado — livraison v2

## Validation avant livraison

```bash
pnpm install --frozen-lockfile
pnpm build:web
pnpm build:monitor
pnpm test:monitor
pnpm test:monitor:browser
pnpm test:operations
pnpm lint:check
```

Le test navigateur utilise Docker et Chromium, uniquement sur 127.0.0.1, sans
base ni accès production. Par défaut il reconstruit un service worker avec la
stratégie précédente. Pour vérifier une migration depuis l'image réellement
installée, définir `KADO_PREVIOUS_WEB_IMAGE=kado-web:<ancienne-révision>`.
`KADO_CADDY_TEST_IMAGE` permet d'utiliser une image locale Caddy 2.11.7.
Les captures du tableau affichent **des données de test**, jamais de faux
chiffres présentés comme une observation de la production.

La CI construit le tableau et teste son serveur local, la collecte et le cache.
Le test de livraison existant conserve ses vérifications API, CSP, sauvegarde et
restauration; son spool de surveillance appartient au répertoire de test.

## Installation sur le VPS

Cette procédure est à appliquer lors de la livraison normale. La préparation
locale et les tests ne changent pas le site en production.

1. Créer un commit propre, construire le bundle habituel avec
   `pnpm release:bundle`, puis transférer et vérifier les sommes de contrôle. Le bundle inclut
   `source.tar.gz`, contenant le code et les scripts de la même révision que les images.
   Conserver la révision précédente des images, du code `deploy/`, du fichier
   Compose et des unités systemd; préserver les fichiers de configuration privés.
2. Avant de remplacer le collecteur, exécuter **la nouvelle version** de
   `deploy/scripts/prepare-monitor.sh` sur le VPS. Elle crée les répertoires
   privés et sauvegarde SQLite via son API de sauvegarde, avec vérification
   d'intégrité. Elle ne déploie pas les images et ne modifie pas PostgreSQL.
   Les snapshots de retour arrière sont conservés sept jours lors des préparations.
3. Arrêter `kado-monitor.timer`, attendre la fin de `kado-monitor.service`, puis
   installer ensemble les nouveaux scripts (`monitor.py`, `activity.py`,
   `status.sh`, `monitor.sh`, `status.mjs`, `common.sh`), le fichier Compose et
   les unités. Ne pas lancer simultanément un ancien `status:prod`.
4. Effectuer la livraison normale par `release.sh` : sauvegarde PostgreSQL
   préalable, migrations habituelles et attente des contrôles de santé. Les
   images web contiennent les deux fichiers Caddy. Le volume de journal doit
   correspondre à `KADO_MONITOR_LOG_DIR` côté Compose **et** collecteur.
   Aucun reset de base, aucune suppression d'échanges.
5. Exécuter `systemctl daemon-reload`, puis `systemctl enable --now
   kado-monitor.timer` et `systemctl start kado-monitor.service`. Le premier
   relevé ajoute les tables SQLite, établit le début des catégories et produit
   le bilan version 2. Les anciennes requêtes globales sont conservées, sans
   inventer leur classement.
6. Vérifier `pnpm status:prod`, le JSON en lecture seule et `pnpm monitor:prod`.
   Faire un petit nombre d'ouvertures contrôlées sur ordinateur et téléphone,
   noter leurs heures et leur nombre : elles font partie du trafic. Vérifier
   le retour sur l'accueil, le cache revalidé et le statut de la collecte.
   Attendre une heure complète pour une première comparaison des deux sources.

## Retour arrière

Arrêter le minuteur et attendre la fin de la collecte. Remettre les images,
scripts, Compose et unités de la révision précédente par la procédure normale,
sans restaurer PostgreSQL. Les tables SQLite v2 sont additives : l'ancien
collecteur peut utiliser ses tables d'origine sans perdre son historique.
Redémarrer le minuteur après `daemon-reload`. Le tableau v2 indique alors que
le collecteur n'est plus compatible; `pnpm status:prod` reste disponible.

Ne restaurer le snapshot SQLite que si son intégrité est compromise, collecteur
arrêté, en conservant d'abord le fichier courant. Cela abandonne les mesures
postérieures au snapshot et doit être signalé comme une coupure. La remise en
place d'un ancien service worker dépend du prochain cycle de mise à jour du
navigateur : vérifier aussi ce parcours avant de conclure le retour arrière.
Les journaux filtrés restant sur disque doivent être purgés après arrêt de leur
producteur; ne pas les ajouter aux sauvegardes de longue durée.

## Interprétation

- Une demande d'accueil est une réponse GET 200 ou 304 reçue par le serveur,
  pas une preuve de lecture ni une personne unique.
- « Navigation » signifie seulement que les en-têtes reçus le permettent.
  Un service worker peut transformer ces en-têtes; le sous-total est partiel.
- Les essais personnels, robots et aperçus de liens restent inclus.
- Un trou de collecte ou une période antérieure au début des mesures reste
  visible, sans extrapolation ni remplacement par zéro.
- Les instantanés des échanges ne permettent pas de reconstituer les échanges
  créés puis supprimés entre deux relevés.
