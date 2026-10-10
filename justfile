# Afficher les commandes disponibles.
default:
    @just --list

# Installer les dépendances JavaScript verrouillées.
install:
    npm ci

# Vérifier les types et exécuter les tests unitaires.
check:
    npm test

# Exécuter les tests dans un profil VS Code isolé.
integration:
    npm run test:integration

# Vérifier et produire l'extension installable.
package: check
    npm run package
