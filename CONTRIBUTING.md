# Contribuer à Kado

## Branches

`main` est l'unique branche permanente. Elle contient le travail intégré et validé,
prêt à être livré. La production peut utiliser une version antérieure identifiée
par son commit et son tag de version.

Créer une branche temporaire par chantier, avec un nom court et explicite :

- `feat/choix-de-langue` pour une fonctionnalité;
- `fix/liens-incomplets` pour un correctif;
- `style/largeur-modales` pour une modification visuelle;
- `docs/installation` pour la documentation;
- `chore/organisation-depot` pour l'entretien;
- `experiment/nouvel-accueil` pour un essai.

Développement, test et production sont des environnements. Il n'y a pas de
branches permanentes `dev`, `test` ou `prod` à synchroniser.

## Cycle de travail

Avec un dossier de travail propre, commencer par :

```bash
git switch main
git pull --ff-only
git switch -c fix/description-du-probleme
```

1. Réaliser un changement cohérent et vérifier le diff avant chaque commit.
2. Exécuter les tests et les builds adaptés au changement.
3. Pousser la branche pour sauvegarder le travail : `git push -u origin HEAD`.
4. Ouvrir une pull request vers `main`, avec le problème résolu, le résultat et les validations.
5. Attendre la réussite de la CI et relire le diff. Une auto-relecture suffit quand Dave travaille seul.
6. Intégrer le chantier. Utiliser une fusion avec regroupement (*squash merge*) si les commits intermédiaires sont des essais; conserver les commits s'ils sont déjà cohérents et descriptifs.
7. Supprimer la branche temporaire sur GitHub, actualiser `main`, puis supprimer la branche locale.

Après une fusion squash, Git peut considérer la branche locale comme non fusionnée,
car les identifiants ont changé. Vérifier la pull request fusionnée avant de forcer
la suppression de cette seule branche. Pour une fusion ordinaire, utiliser `git branch -d`.

Un essai abandonné peut être conservé dans un tag annoté `archive/AAAA-MM-JJ/nom`
avant suppression de sa branche. Pour le reprendre, créer une nouvelle branche
à partir du tag. Ne pas déplacer les tags existants.

## Commits

Un commit décrit un changement utile. Les messages peuvent être en français;
utiliser de préférence `type: description précise` :

```text
fix: empêcher les liens incomplets de bloquer les suggestions
feat: ajouter le choix de langue
style: harmoniser la largeur des fenêtres
test: vérifier la reprise après un lien invalide
docs: préciser la procédure de livraison
chore: simplifier les branches du dépôt
```

Ajouter un paragraphe explicatif lorsque la raison du changement ou un compromis
n'est pas évident. Éviter les messages comme `fix?`, `polish` ou `aaa`.
Les anciens commits restent inchangés. Ne pas réécrire `main` ou un historique
déjà publié pour améliorer sa présentation.

## Vérifications

Le workflow [CI](.github/workflows/ci.yml) décrit les contrôles complets : tests API
sur PostgreSQL jetable, tests web et monitoring, compilation, lint, scripts
d'exploitation et parcours navigateur sur une stack isolée.

Pour une modification applicative, lancer au minimum les tests du composant
concerné et son build. Pour la documentation seule, vérifier les liens, les
commandes et le diff. La CI complète doit réussir avant la fusion.

Les pushes de branches, les pull requests et les tags `v*` déclenchent la CI.
Le workflow actuel exclut les tags `archive/*` : ils conservent des états
historiques qui ne sont pas des candidats à une livraison. Attention : un tag
pointant sur un ancien commit utilise le workflow de ce commit et peut donc
encore déclencher son ancienne CI lors de sa première publication.

## Versions et production

Pour une livraison, choisir un commit validé de `main`, créer un tag annoté
`vMAJEURE.MINEURE.CORRECTIF` et publier ce tag. Par exemple, `v1.0.0` désignerait
une première version numérotée explicitement choisie; ce guide ne crée pas cette version.

Construire et tester le bundle à partir de ce commit propre, puis utiliser
la procédure de [déploiement](deploy/README.md). Les images et le fichier
`version` continuent d'utiliser le SHA complet du commit : un tag lisible ne
remplace pas cette traçabilité.

Un tag désigne une version; il ne prouve pas qu'elle est effectivement déployée.
La version installée doit être vérifiée après la livraison. Ni un push, ni une
fusion, ni la création d'un tag ne déclenche un déploiement automatique dans le
workflow actuel. Une livraison en production reste une action explicitement demandée.

## Historique de la réorganisation

Voir le [relevé du 18 novembre 2026](docs/REPOSITORY-MIGRATION-2026-11-18.md)
pour les anciennes branches et leurs repères d'archive.
