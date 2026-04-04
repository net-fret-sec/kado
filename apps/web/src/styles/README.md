# Styles Guide

Ce dossier contient la base de customisation Bootstrap de l'application web.

## Structure

- `_bootstrap-variables.scss`: tokens visuels (palette, radius, typo, inputs) injectes dans Bootstrap.
- `main.scss`: point d'entree SCSS, charge Bootstrap avec `@use ... with (...)`, puis les overrides.
- `_custom-overrides.scss`: ajustements cibles de composants (buttons, cards, inputs).

## Philosophie

- Bootstrap d'abord: prioriser les variables et utilitaires Bootstrap.
- Overrides minimaux: n'ajouter du CSS custom que pour des besoins visuels clairs.
- Accessibilite en premier: contraste lisible, focus visible, et etats hover/active coherents.

## Tokens principaux

- Primary: `#4F46E5`
- Primary dark: `#3730A3`
- Accent: `#06B6D4`
- Accent dark: `#0288A2`
- Secondary: `#64748B`
- Surface light: `#F8FAFC`
- Surface dark: `#0F1724`

## Regles de style

- Eviter les gradients sur les boutons primaires si cela degrade le contraste.
- Appliquer un radius unique et modere (`0.5rem`) pour boutons, cartes et champs.
- Eviter les formes `pill` (coins totalement arrondis) sauf exigence fonctionnelle explicite.
- Conserver un focus ring visible (`:focus-visible`) sur les elements interactifs.
- Eviter `!important` sauf cas exceptionnel documente.
- Garder les transitions courtes et discretes (environ 120ms a 180ms).

## Ajouter un nouveau style composant

1. Verifier si Bootstrap couvre deja le besoin (variable, classe utilitaire, variante).
2. Si necessaire, ajouter l'override dans `_custom-overrides.scss`.
3. Reutiliser les tokens de `_bootstrap-variables.scss` via `@use`.
4. Tester au minimum:
- `pnpm --dir apps/web type-check`
- `pnpm --dir apps/web build`

## Theming

- Le theme clair est porte par les variables Bootstrap.
- Le theme sombre est active via la classe `.theme-dark` dans `main.scss`.
- Preferer les variables de couleur existantes avant d'introduire de nouveaux tokens.

## Maintenance

- En cas de warning Sass provenant de dependances, garder `quietDeps: true` dans Vite.
- Migrer vers des APIs Sass modernes (`@use`, `sass:color`) pour les fichiers locaux.
- Toute nouvelle couleur doit etre justifiee par un usage semantique clair.
