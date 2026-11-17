# Suivi des correctifs Kado

## Budget — anomalies confirmées le 15 novembre 2026

Décision de Dave : priorité différée, à reprendre lors des prochaines passes de
correctifs. Ces cas limites restent ouverts et ne doivent pas être ignorés.
Aucune correction ni livraison supplémentaire demandée pour le moment.

### BUDGET-01 — Effacer le budget bloque l’enregistrement

- Statut : ouvert, non prioritaire.
- Reproduction : ouvrir les paramètres d’un échange ayant un budget, puis vider
  entièrement le champ Budget.
- Résultat constaté : « Enregistrer » devient désactivé, sans message expliquant
  le blocage. Saisir de nouveau un montant permet de continuer.
- Cause : le champ numérique vide produit une chaîne vide; le schéma accepte un
  nombre ou une valeur absente. Le budget est pourtant facultatif.
- Correction attendue : permettre d’effacer explicitement un budget existant,
  de bout en bout, et expliquer les saisies réellement invalides. Distinguer
  l’effacement, le montant zéro et un champ omis qui doit conserver la valeur
  existante; ne pas simplement omettre le budget dans la requête.
- Vérification de clôture : effacer un budget, enregistrer et recharger; confirmer
  son absence, la conservation des autres paramètres et l’acceptation de zéro.
- Sources : `apps/web/src/components/EditExchangeModal.vue`,
  `packages/shared/src/exchange/exchange.schema.ts` et la mise à jour API associée.

### BUDGET-02 — Un montant hors limite provoque une erreur serveur

- Statut : ouvert, non prioritaire; cas extrême confirmé sur une base temporaire.
- Reproduction : enregistrer un budget de `100000000`, ou de `99999999.999`.
- Résultat constaté : la validation accepte la valeur, mais l’API retourne 500.
  Une requête suivante avec un montant normal réussit; le serveur reste actif.
- Cause : le schéma ne définit pas de maximum, tandis que PostgreSQL utilise
  `NUMERIC(10,2)`. Le montant maximal représentable est `99999999.99`; l’arrondi
  d’une valeur comportant davantage de décimales peut aussi dépasser ce plafond.
- Correction attendue : aligner la validation partagée avec la capacité de
  stockage, préciser le traitement des décimales et afficher une erreur de champ
  compréhensible avant toute erreur SQL. L’API doit aussi refuser une requête
  directe invalide avec une erreur de validation plutôt qu’une réponse 500.
- Vérification de clôture : tester le maximum, son dépassement et le dépassement
  après arrondi; conserver le budget précédent lorsque la demande est refusée.
- Sources : `packages/shared/src/exchange/exchange.schema.ts`,
  `apps/api/migrations/001_init.sql` et
  `apps/api/src/repositories/exchange.repository.ts`.
