import * as vscode from 'vscode';
import * as path from 'node:path';
import { stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Exercise } from '../../src/core';
import { Runner } from '../../src/runner';
import { sourceExclusions } from '../../src/documents';

export async function run(api: any, _extension?: unknown): Promise<void> {
  const bank = process.env.MPI_ENSEIGNEMENT_ROOT!;
  const grammaires = 'exercices/banque/langages/grammaires-lineaires/grammaires-lineaires.typ';
  assert.ok(api.getEntries().some((entry: Exercise) => entry.fichier === grammaires), 'Exercice découvert avec son code dans le même dossier');
  assert.ok(!api.getEntries().some((entry: Exercise) => entry.fichier.startsWith('lib/tests/')), 'Tests de bibliothèque exclus du catalogue');
  const visibles = await vscode.workspace.findFiles('**/*.typ', sourceExclusions);
  assert.ok(!visibles.some(uri => path.relative(bank, uri.fsPath).split(path.sep).join('/').startsWith('lib/tests/')), 'Tests de bibliothèque exclus des vues VS Code');
  for (const source of [
    'exercices/concours/17/centrale-2017-mp-informatique/centrale-2017-mp-informatique.typ',
    'exercices/concours/18/oral/ens-2018-mp-reparation-langage/ens-2018-mp-reparation-langage.typ',
    'exercices/concours/19/mines-ponts-2019-mp-informatique/mines-ponts-2019-mp-informatique.typ',
    'exercices/concours/22/centrale-2022-mp-informatique/centrale-2022-mp-informatique.typ',
  ]) assert.equal((await api.revealSheet(source)).source, source, 'Sujet découvert dans son dossier');
  const migrationRunner = new Runner();
  try {
    const project = { root: bank, name: 'Banque réorganisée', scope: vscode.Uri.file(bank) };
    for (const source of [grammaires, 'exercices/concours/19/mines-ponts-2019-mp-informatique/mines-ponts-2019-mp-informatique.typ']) {
      await migrationRunner.run(project, ['c', source]);
      for (const variant of ['enonce', 'corrige'])
        assert.ok((await stat(path.join(bank, 'build', source.slice(0, -4), variant + '.pdf'))).size > 0);
    }
  } finally { migrationRunner.dispose(); }
  console.log('Organisation : catalogue, sujets imbriqués et exports vérifiés, sans lecture des PDF.');
}
