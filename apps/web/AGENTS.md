# Conventions de l'interface web

Pour toute nouvelle interface ou tout nouveau widget dans `apps/web`, suivre `src/styles/README.md`.
Utiliser d'abord les composants et utilitaires Bootstrap 5.3, surtout Flex et les espacements.
Éviter `row`/`col-*` pour la mise en page; réserver les tableaux aux données tabulaires.
Ajouter du CSS propre à Kado uniquement pour un besoin de thème, d'illustration, d'interaction,
d'accessibilité ou de mise en page que les utilitaires ne rendent pas clairement.
Une différence de quelques pixels avec le rendu actuel est acceptable si la lisibilité et l'accessibilité sont préservées.
