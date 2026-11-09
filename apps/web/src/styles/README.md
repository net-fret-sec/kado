# Styles Guide

Ce dossier contient la couche de thème et d'overrides Bootstrap utilisée par le frontend Kado.

## Structure

- `_bootstrap-variables.scss`: tokens de thème injectés dans Bootstrap, palette, typographie, rayons, ombres et variables de formulaires.
- `main.scss`: point d'entrée SCSS, charge Bootstrap via `@use ... with (...)`, définit aussi des variables CSS d'application.
- `_custom-overrides.scss`: styles ciblés pour les composants qui ne se règlent pas proprement par variables Bootstrap.

## Direction visuelle actuelle

Le thème actif n'est plus le schéma bleu-violet des premières itérations. Le frontend utilise maintenant une palette plus chaude et minérale.

Tokens dominants actuels:

- Primary: `#256665`
- Primary dark: `#1f4e4f`
- Accent / warning: `#e0a93b`
- Accent dark: `#c97a2b`
- Secondary: `#786f63`
- Fond principal: `#f8faf9`
- Surface beige: `#f3ead8`
- Texte principal: `#1f4e4f`

## Typographie et formes

- Bootstrap reçoit une base sans-serif orientée `Manrope` pour le corps.
- `main.scss` expose ensuite des variables CSS de typo pour les tests visuels et certaines hiérarchies de titres.
- Les contrôles de formulaire gardent un rayon discret, mais les boutons, badges et pills peuvent volontairement utiliser des formes très arrondies.
- Les cartes et modales utilisent des ombres faibles plutôt que des contrastes très durs.

## Principes de travail

- Pour toute nouvelle interface ou tout nouveau widget, partir des composants et des utilitaires Bootstrap 5.3 (Flex, espacement, tailles, typographie, couleurs et états).
- Préférer `d-flex`, `flex-wrap` et `gap-*` pour la mise en page. Réserver `table` aux données tabulaires; ne pas réintroduire `row`/`col-*` dans les composants Vue pour organiser l'interface.
- Accepter une valeur Bootstrap proche lorsqu'une différence de quelques pixels ne nuit ni à la lisibilité ni à l'accessibilité. Éviter une règle propre à Kado pour reproduire un espacement ordinaire au pixel près.
- Modifier d'abord les variables Bootstrap avant d'ajouter du CSS spécifique.
- Réutiliser les tokens déjà présents avant d'introduire une nouvelle couleur ou une nouvelle échelle d'espacement.
- Garder un focus visible et des contrastes lisibles.
- Préserver la cohérence entre les variables Sass injectées dans Bootstrap et les variables CSS déclarées dans `main.scss`.
- Garder le CSS propre à Kado pour les thèmes, illustrations, proportions vraiment utiles, interactions et cas où les utilitaires rendent le balisage moins clair. Une petite grille CSS reste adaptée à l'alignement bidimensionnel des formulaires.

## Ajouter ou modifier un style

1. Vérifier si une variable, un composant ou une classe utilitaire Bootstrap couvre le besoin.
2. Si un style propre est nécessaire, le limiter au composant concerné; le placer dans le SCSS commun seulement s'il est réellement partagé. Ne pas déplacer une règle scoped dans le global pour réduire artificiellement le nombre de blocs.
3. Si le style doit être réutilisable à grande échelle, l'exprimer d'abord comme token dans `_bootstrap-variables.scss` ou comme variable CSS dans `main.scss`.
4. Contrôler les largeurs mobiles, les textes longs, les thèmes, le focus clavier et l'usage tactile quand le style touche la mise en page ou une interaction.
5. Valider au minimum avec:

```bash
pnpm --dir apps/web type-check
pnpm --dir apps/web build
```

## Maintenance

- `quietDeps: true` est conservé dans Vite pour éviter le bruit Sass venant des dépendances.
- Les fichiers locaux doivent rester sur les APIs Sass modernes comme `@use` et `sass:color`.
- Toute nouvelle couleur ou variante typographique doit avoir un usage sémantique clair dans l'interface.
