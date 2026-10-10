# Enseignement Typst

Extension VS Code pour [enseignement](https://github.com/mpi-informatique/enseignement) et `enseignement-prive` : rechercher des exercices, composer des documents, afficher les énoncés et les corrigés, exporter leurs PDF.

## Installation

Après sa première publication, installer [Enseignement Typst depuis le Marketplace](https://marketplace.visualstudio.com/items?itemName=qfortier.vscode-enseignement) et activer **Auto Update** dans le menu de l'extension. Les nouvelles versions seront récupérées automatiquement.

Pour une installation manuelle, utiliser le VSIX des [versions GitHub](https://github.com/mpi-informatique/vscode-enseignement/releases) ou de `releases/` avec **Extensions → … → Installer à partir d'un VSIX**. Une installation en VSIX désactive par défaut la mise à jour automatique : la réactiver après disponibilité sur le Marketplace.

Ouvrir ensuite le dépôt public ou privé, ou leur dossier parent : les dépôts enfants immédiats sont détectés automatiquement. Pour les consulter ensemble, ouvrir `enseignement-prive/enseignement.code-workspace`.

L'identifiant est `qfortier.vscode-enseignement`, les réglages utilisent `mpiEnseignement.*`. Désactiver l'ancienne extension Exercices Typst dans cet espace de travail pour éviter les raccourcis en double. Les réglages personnalisés de `mpiExercices.*` peuvent être reportés vers le nouveau préfixe : `makePath` devient `pythonPath`.

Prérequis : VS Code ≥ 1.100 et Nix avec `nix-command` et `flakes`. Tinymist est recommandé pour l'aperçu à la frappe. Sans Nix, choisir le mode `direct` et fournir Python ≥ 3.11, Typst, les dépendances Typst et, pour le privé, `ENSEIGNEMENT_SOURCE`.

## Utilisation

- **Fichier** : plan du document ouvert, questions, parties et composition cliquables.
- **Exercices** : exercices réutilisables de la banque, avec recherche et filtres de métadonnées.
- **Documents** : TD, devoirs, concours, copies et types personnalisés, avec recherche et filtre par type.

Les contenus sont reconnus d'après leur code, indépendamment du dossier : export `ex` pour un exercice, `feuille.with(type: "…", ...)` pour un document. Les fonctions de mise en page personnalisées déclarant un `type` sont aussi reconnues. Les dossiers techniques et `build/` sont exclus.

La structure habituelle est `exercices/banque/`, `exercices/concours/`, `exercices/devoirs/` et `exercices/feuilles/`. Les futures familles `cours/`, `tp/` et `algorithmes/` peuvent utiliser les mêmes vues. Le privé ajoute `corrections/<annee>/ds/<devoir>/copies/`.

La recherche ouvre un fichier sans filtrer le panneau. Elle ignore les accents et la casse, et place en premier les fichiers ouverts puis les fichiers récemment consultés. Les filtres du panneau restent appliqués. Le catalogue public est régénéré automatiquement si les sources Typst ont changé sur disque, avec un regroupement des changements toutes les cinq secondes. Une erreur conserve le dernier catalogue valide.

**Créer un exercice** utilise le modèle du dépôt et le vocabulaire de sa bibliothèque. Dans le privé, ce vocabulaire vient de la révision publique verrouillée. **Créer un document** propose les modèles de `templates/`. Les destinations suggérées suivent la structure ci-dessus et restent modifiables.

Les TD et devoirs composés démarrent vides : sélectionner un document, puis ajouter ou glisser des exercices du même dépôt. Les flèches réordonnent les exercices et **×** retire leur import. Les compositions calculées restent modifiables dans la source. Les modifications sont enregistrées et annulables. Un import utilisé ailleurs et un barème personnalisé empêchent une réécriture ambiguë.

Glisser un fichier sur un dossier permet de le déplacer dans son dépôt : les références Typst littérales sont actualisées. Vérifier les chemins calculés et les références externes. La suppression passe par la corbeille et refuse un fichier encore référencé. Les déplacements entre dépôts restent manuels.

## Raccourcis

Dans un éditeur Typst ou une liste du panneau, hors des champs de saisie :

| Touche | Seule | Avec Maj |
| --- | --- | --- |
| F2 | Chercher un exercice | Chercher un document |
| F3 | Filtrer les exercices | Filtrer les documents |
| F4 | Ajouter un exercice | Créer un document |
| F5 | Afficher l'énoncé | Exporter l'énoncé |
| F6 | Afficher le corrigé | Exporter le corrigé |

Sur Mac, Fn peut être nécessaire. Échap ou **×** efface les filtres actifs du panneau. **Tout replier** et **Basculer dossiers / liste** sont dans **…**.

## Compilation et aperçu

Les commandes appellent `python3 scripts/build.py` dans le dépôt concerné. En mode `auto`, un `flake.nix` déclenche `nix develop path:. -c python3 scripts/build.py …`. Just reste disponible dans les dépôts pour le terminal, mais l'extension n'en dépend pas.

Les exports et le lecteur PDF de secours utilisent l'action `c chemin.typ`, qui compile les deux variantes. Les PDF restent sous `build/<chemin-sans-extension>/`. Pour une copie privée, le corrigé s'appelle `<eleve>-cor.pdf`. Les scripts du privé actualisent les notes avant de compiler les copies.

Avec Tinymist, le rendu vectoriel suit les modifications sans enregistrer. Les boutons Énoncé et Corrigé réutilisent leurs sessions. **↔** active les sauts entre source et aperçu, **lune** inverse le thème. L'extension fournit à son moteur Tinymist les chemins de packages de l'environnement Nix : la révision utilisée dans le privé est celle de son `flake.lock`, sans installation utilisateur préalable. Les CSV `notes.csv` et `recapitulatif.csv` actualisent aussi l'aperçu d'une copie.

Sans Tinymist, un lecteur PDF se recharge à l'enregistrement, sans synchronisation source. Enregistrer les fichiers avant d'exporter. Une erreur de compilation apparaît dans Problems et dans la barre d'état, avec un lien vers le journal.

| Réglage | Rôle |
| --- | --- |
| `mpiEnseignement.execution` | `auto` par défaut, `nix` ou `direct`. |
| `mpiEnseignement.bankPath` | Racine du dépôt, si différente du dossier ouvert. |
| `mpiEnseignement.pythonPath` | Exécutable Python dans l'environnement choisi, `python3` par défaut. |
| `mpiEnseignement.nixPath` | Exécutable Nix. Les installations standard macOS sont détectées. |
| `mpiEnseignement.previewTheme` | `auto`, `light` ou `dark`. |

## Développement

```sh
nix develop path:.
npm ci
npm test
npm run test:integration
npm run package
```

`just check`, `just integration` et `just package` fournissent des raccourcis dans cet environnement. Le VSIX est produit dans `releases/` et exclu de Git. `flake.lock` et `package-lock.json` fixent les outils et les dépendances JavaScript. Avec direnv et nix-direnv, `direnv allow` active l'environnement.

Les tests unitaires couvrent la découverte, les métadonnées, les chemins, la composition et les commandes Python/Nix. Les tests d'intégration ouvrent un profil VS Code isolé, utilisent des documents et des copies fictifs, et ne lisent pas les données d'élèves.

Pour une seule suite : `npm run test:integration -- --suite=edition`. Suites : `decouverte`, `edition`, `apercu`, `corrections`, `documents`. Les suites publiques utilisent le clone voisin `../enseignement`. La suite `corrections` nécessite les outils de `../enseignement-prive`, sans en copier les corrections. Les aperçus natifs nécessitent Tinymist installé.

Variables de test : `MPI_ENSEIGNEMENT_ROOT` pour le dépôt ouvert, `MPI_PUBLIC_ROOT` pour les outils publics, `MPI_PRIVATE_ROOT` pour les outils privés, `VSCODE_EXECUTABLE` et `TINYMIST_PATH` pour choisir les installations. Consulter [l'organisation du code](scripts/README.md) pour comprendre les différents modules.

Le code reprend l'extension locale `vscode-exercices-mpi`. La licence reste `UNLICENSED`, comme dans le dépôt d'origine. Les licences des composants embarqués sont conservées dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Publication

Le workflow [Publication Marketplace](.github/workflows/publish.yml) teste et publie chaque tag stable `vX.Y.Z`. La configuration initiale du compte éditeur, de l'authentification et la préparation des versions sont décrites dans le [guide de publication](docs/publication.md).
