# Réorganisation du dépôt — 18 novembre 2026

Objectif : conserver l'historique et le code courant, utiliser `main` comme unique
branche permanente et archiver les essais terminés.

## État de départ

Le travail courant se trouvait dans `experiment/accueil-contenu` au commit
`ce293acc7022d313537730c98e8a649471966202`. Le dossier était propre. Les trois
derniers commits n'étaient pas encore publiés sur GitHub.

`main` local (`0e4485e`) et `main` distant (`8ed6f75`) sont des ancêtres de ce
travail. `devel` distant pointait également sur `8ed6f75`. Leur mise à niveau
ne nécessite ni réécriture de commits ni push forcé.

Dave a réalisé une copie intégrale du dossier avant l'opération. Un bundle Git
supplémentaire a été créé et vérifié dans
`/tmp/kado-before-reorganization-2026-11-18.bundle`; ce fichier temporaire n'est
pas une sauvegarde durable. Les tags ci-dessous conservent les états utiles dans Git.

## Conservation des branches

| Ancienne branche | Commit de départ | Traitement |
| --- | --- | --- |
| `experiment/accueil-contenu` | `ce293ac` | Base de `main`; tag `archive/2026-11-18/accueil-contenu`. |
| `test-sandstone` | `f4f4df1` | Incluse dans la base; tag `archive/2026-11-18/test-sandstone`. |
| `fix/incomplete-gift-links-release` | `f4952ee` | Réconciliation ci-dessous; tag `archive/2026-11-18/fix-incomplete-gift-links-release`. |
| `look-dark` | `b7dcbb7` | Ancien essai visuel conservé dans `archive/2026-11-18/look-dark`. |
| `test-de-look-B` | `54b0057` | Ancien essai visuel conservé dans `archive/2026-11-18/test-de-look-B`. |
| `copilot/worktree-2026-04-27T16-27-16` | `a96ee78` | Historique déjà inclus; seule la référence Git au dossier de travail disparu est retirée. |
| `devel` distant | `8ed6f75` | Historique déjà inclus dans `main`. |

Le tag préexistant `alpha` est conservé. Les deux anciens essais visuels ne sont
pas réintroduits dans l'interface actuelle.

## Réconciliation du correctif des liens incomplets

Les modifications de validation du commit `2ee1068` sont déjà présentes dans la
base retenue. Le schéma partagé et les tests `wishlist-validation.test.ts` sont
identiques entre la branche de correctif et cette base. Les tests de vues ont été
conservés et enrichis depuis.

La seule différence de `deploy/scripts/browser-p2.mjs` par rapport à cette branche
est le scénario de 31 lignes ajouté par `f4952ee`. Ce commit a été repris avec
`cherry-pick -x`, en conservant sa provenance. Il vérifie un lien incomplet, sa
correction, l'ajout d'une sixième suggestion avec image et sa persistance après
rechargement.

## Portée

La réorganisation conserve les identifiants des anciens commits. Elle ne change
ni les données applicatives ni la version déployée en production. Les règles de
travail sont définies dans [CONTRIBUTING.md](../CONTRIBUTING.md).

## Validation locale

- 144 tests web et 136 tests API réussis.
- Builds web, API et monitoring, contrôle des types partagés et lint réussis.
- 33 tests monitoring, contrôles d'exploitation et parcours navigateur du monitoring réussis.
- Parcours de livraison sur des images Docker locales : scénario récupéré des
  liens incomplets, autres parcours P2, sauvegarde/restauration de la base jetable,
  comportement du monitoring et arrêt des services vérifiés.
- Syntaxe des scripts Bash vérifiée. ShellCheck n'était pas installé sur la
  machine; son contrôle reste à confirmer par la CI GitHub après publication.

Ces vérifications utilisent des environnements jetables et ne constituent pas
un déploiement en production.
