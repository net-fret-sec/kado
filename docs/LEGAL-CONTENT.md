# Pages juridiques externes

Les routes `/conditions-utilisation` et `/confidentialite` sont accessibles sans
compte et reliées depuis le pied de page commun, y compris lorsque le contact et
le soutien sont désactivés. Le français est la référence éditoriale. Les traductions sont des fichiers distincts, pas des traductions automatiques.

## Fichiers et configuration

Le contenu réel n'est ni suivi dans Git ni inclus dans les images de l'application.
Les sources locales se trouvent dans `apps/web/public`, avec des règles Git pour
les garder hors du code versionné; les originaux privés de `notes/contenus` restent
intacts. Le dossier d’exploitation recommandé est
`/var/lib/kado/legal` :

```text
apps/web/public/
  legal-config.json
  conditions.md
  confidentiality.md
  conditions-fr.md           # facultatif, prioritaire sur conditions.md en français
  confidentiality-fr.md      # facultatif
  conditions-en.md           # facultatif
  confidentiality-en.md      # facultatif
  conditions-es.md           # facultatif
  confidentiality-es.md      # facultatif
```

Pour chaque document, le fichier de la langue demandée (`-fr`, `-en`, `-es`) est
prioritaire. S'il est absent, le lecteur utilise le fichier sans suffixe. Les deux
fichiers de base suffisent donc pour commencer. `defaultLocale` déclare leur langue
(`fr-CA` par défaut); le titre et l'attribut `lang` reflètent cette langue, et une
mention traduite explique le repli à l'utilisateur. Un fichier suffixé vide,
illisible ou invalide est une erreur : il ne déclenche pas un repli silencieux.

L'interface continue de consulter l'API, qui lit ces sources à chaque requête et
produit du HTML restreint. Elle ne lit pas une copie incorporée au JavaScript. En
développement, `public` rend aussi ces sources brutes accessibles : ne jamais y
mettre de notes internes ni de secrets. Les règles `.dockerignore` excluent ces
fichiers des images de livraison; la production utilise le dossier monté de
l'hôte. Une compilation Vite locale peut en copier un instantané dans `dist` :
cette copie n'est pas la source lue par l'API et ne doit pas servir à les modifier.

Exemple **fictif**, à remplacer avant toute publication :

```json
{
  "version": 1,
  "defaultLocale": "fr-CA",
  "status": "draft",
  "variables": {
    "serviceName": "Exemple",
    "operatorName": "Responsable exemple",
    "projectName": "Projet exemple",
    "domain": "https://example.com",
    "contactEmail": "help@example.com"
  },
  "documents": {
    "conditions-utilisation": {
      "effectiveAt": null,
      "updatedAt": "2026-11-26",
      "titles": {
        "fr-CA": "Conditions d’utilisation",
        "en-CA": "Terms of use",
        "es": "Condiciones de uso"
      }
    },
    "confidentialite": {
      "effectiveAt": null,
      "updatedAt": "2026-11-26",
      "titles": {
        "fr-CA": "Confidentialité",
        "en-CA": "Privacy",
        "es": "Privacidad"
      }
    }
  }
}
```

Les dates sont au format `AAAA-MM-JJ`. `updatedAt` est la date de modification
éditoriale, pas la date de lecture du fichier. `effectiveAt` reste `null` tant que
le texte n'est pas en vigueur. `status: "draft"` affiche un avertissement en
développement et en test; **l'API de production refuse les brouillons**. Pour
publier, relire les fichiers fournis et vérifier les replis, inscrire les dates effectives et utiliser
`status: "published"`. Le validateur exige alors les deux dates d'entrée en vigueur.

Les valeurs `{{ serviceName }}`, `{{ operatorName }}`, `{{ projectName }}`,
`{{ domain }}` et `{{ contactEmail }}` sont substituées comme du texte, sans
exécution. Par exemple :

```markdown
## Nous joindre

{{ serviceName }} est proposé par {{ operatorName }}.
[Contact](mailto:{{ contactEmail }}).
Voir la [confidentialité](/confidentialite).
```

Le titre principal provient de `legal-config.json`; commencer les sections Markdown par `##`.
Listes, paragraphes, emphase et liens explicites sont permis. Le HTML brut est
affiché comme texte; les images sont désactivées. Les liens sont limités à HTTP,
HTTPS, courriel, fragments et aux deux routes juridiques locales. Les variables
inconnues, le titre `#`, les fichiers vides, l'UTF-8 invalide et les configurations
invalides sont refusés. Limites : 64 Kio pour le JSON, 256 Kio par texte. Les chemins
et langues sont une liste fixe; un lien symbolique sortant du dossier est refusé.

## Développement et validation

Dans `apps/api/.env`, définir le chemin absolu :

```dotenv
LEGAL_CONTENT_DIR=/home/dave/dev/kado/apps/web/public
```

Depuis la racine du dépôt :

```bash
pnpm --dir apps/api legal:validate /home/dave/dev/kado/apps/web/public
# Contrôle supplémentaire avant publication (refuse les brouillons) :
pnpm --dir apps/api legal:validate /chemin/vers/legal --published
```

La validation couvre les six combinaisons document/langue, y compris leurs replis,
les métadonnées, les variables et le rendu.
Elle ne valide pas juridiquement les textes ni la configuration effective du VPS.
Les délais de conservation et les prestataires mentionnés doivent correspondre aux
pratiques réelles. La localisation du serveur principal ne prouve pas celle des
copies de sauvegarde. Les points éditoriaux restant à vérifier sont à conserver hors de `public`,
par exemple dans les notes locales ignorées.

## Production : modes autonome et passerelle

Créer et peupler le dossier hôte **avant** le démarrage, avec les seuls fichiers
`conditions*.md`, `confidentiality*.md` et `legal-config.json` fournis dans `public`. Définir
`LEGAL_CONTENT_DIR=/var/lib/kado/legal` dans `deploy/.env.production` (ou le fichier
d'environnement d'exploitation équivalent). Compose monte ce dossier en lecture
seule sur `/app/legal` et définit le chemin interne de l'API. Ce montage appartient
au service API et reste identique avec `docker-compose.edge.yml`.

Le répertoire doit exister et être lisible par l'utilisateur du conteneur; Compose
ne crée pas silencieusement un répertoire vide. Ne pas y déposer de secrets. Il
contient uniquement les textes publics et leur configuration éditoriale.

Après avoir chargé l'image API à déployer, contrôler le montage et les textes avec
la même combinaison de fichiers Compose et d'environnement que le déploiement :

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml \
  run --rm --no-deps api node dist/validate-legal.cjs --published
```

En mode passerelle, ajouter `-f deploy/docker-compose.edge.yml` avant `run`.
Après démarrage, vérifier les six réponses `/api/legal/<document>?locale=<langue>`
et les deux pages dans chaque langue. Le contrôle `/health` ne vérifie pas le contenu
juridique. Les tests de stack utilisent leurs propres textes **fictifs** et jetables.

## Modifier, sauvegarder et revenir en arrière

L'API relit la configuration et le texte à chaque requête. Une modification apparaît
à la prochaine consultation ou actualisation, sans reconstruction ni redémarrage.
Une page déjà ouverte conserve le texte qu'elle affiche jusqu'à cette consultation.
Changer le chemin `LEGAL_CONTENT_DIR` demande en revanche de relancer l'API, ou de
recréer le conteneur lorsque le montage change.

1. Copier le dossier dans un espace de préparation et conserver une copie datée
   de la version actuelle en dehors du dossier servi.
2. Modifier les textes fournis et leurs dates, puis valider la copie.
3. Remplacer chaque fichier par renommage atomique **dans le répertoire monté**
   (fichier temporaire sur le même système de fichiers, puis `mv`). Installer les
   textes avant le JSON. Ne pas remplacer le répertoire monté lui-même : un montage
   existant pourrait continuer à pointer vers son ancien contenu.
4. Vérifier les six réponses et les dates visibles. En cas de problème, restaurer
   les fichiers de la copie précédente par la même méthode et revérifier.

Le remplacement est atomique par fichier, pas pour l’ensemble des fichiers.
Pour une modification incompatible du schéma ou des variables, prévoir une fenêtre
de maintenance. Les variables actuellement reconnues sont fixes.

Les sauvegardes PostgreSQL et les bundles de livraison **ne contiennent pas** ce
dossier. Le sauvegarder séparément avec ses versions et vérifier sa restauration.
Une livraison applicative ne modifie pas ces fichiers.

Les réponses API sont `Cache-Control: no-store`; le service worker exclut `/api`.
Une traduction absente utilise le texte de base en indiquant sa langue. Un fichier
invalide, ou l'absence simultanée du fichier traduit et de sa base, produit une
erreur traduite avec un bouton Réessayer, sans réutiliser un ancien texte. Hors ligne,
la page peut s'ouvrir grâce au cache de l'application, mais n'affiche pas une copie
périmée du document juridique.
