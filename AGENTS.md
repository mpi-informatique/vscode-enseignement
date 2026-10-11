# Consignes pour les assistants

- Lire le README et préserver le contenu des dépôts pédagogiques utilisés pour les tests.
- Ne pas imposer de longueur maximale aux lignes. Choisir les retours à la ligne selon la structure et la lisibilité.
- Conserver les données nominatives, évaluations et scans dans `exercices-prive`. Utiliser des copies fictives dans les tests.
- Les commandes de compilation appellent `scripts/build.py` du dépôt concerné, avec Nix en mode automatique si `flake.nix` existe.
- Vérifier avec `nix develop path:. -c npm test`, puis les suites d'intégration concernées. Produire un VSIX avec `nix develop path:. -c npm run package`.
- Contrôler le diff, annoncer les vérifications réellement effectuées et faire un commit directement sur `main`.
