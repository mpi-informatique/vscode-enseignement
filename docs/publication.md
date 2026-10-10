# Publication et mises à jour

L'identifiant Marketplace est `qfortier.vscode-enseignement`. Le conserver entre les versions pour permettre les mises à jour automatiques. Le workflow [publish.yml](../.github/workflows/publish.yml) teste et publie les tags stables `vX.Y.Z`, puis joint le VSIX à une version GitHub.

## Configuration initiale du Marketplace

Se connecter à la [gestion des éditeurs](https://marketplace.visualstudio.com/manage/publishers/) avec le compte Microsoft propriétaire et créer l'éditeur `qfortier` s'il n'existe pas. S'il appartient déjà à quelqu'un d'autre, choisir un identifiant disponible et modifier `publisher` avant la première publication.

Deux méthodes d'authentification sont prises en charge :

- Publication de confiance : configurer sur le Marketplace une politique autorisant l'organisation GitHub `mpi-informatique`, le dépôt `vscode-enseignement` et le workflow `.github/workflows/publish.yml`. Le workflow utilise alors `vsce publish --oidc`, sans jeton durable. Voir le [guide de vsce](https://github.com/microsoft/vscode-vsce#trusted-publishing).
- Jeton Marketplace : créer un jeton Azure DevOps disposant de **Marketplace → Manage**, avec le compte ayant accès à l'éditeur, puis l'enregistrer dans le [secret GitHub `VSCE_PAT`](https://github.com/mpi-informatique/vscode-enseignement/settings/secrets/actions). Ne pas mettre le jeton dans le dépôt ou une conversation. Le workflow utilise ce secret lorsqu'il existe. Voir la [documentation Microsoft](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token).

La publication ne peut réussir qu'après cette association au compte éditeur. Un accès GitHub seul ne donne aucun droit sur le Marketplace.

## Première publication

Depuis la racine du dépôt, après configuration de l'authentification et commit des changements :

```sh
git tag v0.1.0
git push origin v0.1.0
```

Suivre le workflow [Publication Marketplace](https://github.com/mpi-informatique/vscode-enseignement/actions/workflows/publish.yml). Pour relancer une publication après correction de l'authentification, utiliser **Run workflow** avec le tag existant. Ne pas déplacer un tag déjà publié.

Le workflow contrôle la concordance du tag, de `package.json` et de `package-lock.json`, ainsi que l'appartenance du commit à `main`. Il exécute les tests unitaires et construit le VSIX avant de publier. Les suites d'intégration VS Code restent à lancer localement avant de créer le tag.

## Versions suivantes

Après les modifications et les vérifications, depuis un dépôt propre sur `main` :

```sh
nix develop path:. -c npm version patch
git push origin main --follow-tags
```

`npm version patch` actualise les deux manifestes, crée le commit de version et un tag annoté. Utiliser `minor` ou `major` si nécessaire. Actualiser aussi `CHANGELOG.md` avant de préparer la version.

## Côté utilisateur

Après disponibilité sur le Marketplace, installer [Enseignement Typst](https://marketplace.visualstudio.com/items?itemName=qfortier.vscode-enseignement), puis activer **Auto Update** dans le menu de l'extension. Pour une installation initiale en VSIX, cette option est désactivée par défaut. Les nouvelles versions sont ensuite récupérées par VS Code, sans réinstallation manuelle. Un redémarrage des extensions ou de la fenêtre peut être proposé.
