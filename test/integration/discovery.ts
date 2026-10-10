import * as vscode from 'vscode';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import { identify } from '../../src/documents';

export async function run(api: any, extension: vscode.Extension<any>): Promise<void> {
  const manifest = extension.packageJSON.contributes;
  const commands = await vscode.commands.getCommands(true);
  assert.deepEqual(manifest.views.mpiEnseignement.map((view: { id: string }) => view.id), ['mpiEnseignement.current', 'mpiEnseignement.library', 'mpiEnseignement.sheets']);
  for (const section of ['current', 'library', 'sheets']) {
    await vscode.commands.executeCommand(`mpiEnseignement.${section}.focus`);
    assert.ok((await vscode.commands.getCommands(true)).includes(`workbench.actions.treeView.mpiEnseignement.${section}.collapseAll`));
    await vscode.commands.executeCommand(`mpiEnseignement.collapse${section}`);
  }
  for (const binding of manifest.keybindings) assert.ok(commands.includes(binding.command), binding.command);
  for (const uri of await vscode.workspace.findFiles('exercices/feuilles/**/*.typ')) {
    const source = path.relative(process.env.MPI_ENSEIGNEMENT_ROOT!, uri.fsPath).split(path.sep).join('/');
    assert.equal(identify((await vscode.workspace.openTextDocument(uri)).getText(), source)?.kind, 'document');
    assert.equal((await api.revealSheet(source)).source, source, 'Les compositions locales et calculées restent consultables');
  }
  const sheetFiles = await vscode.workspace.findFiles('exercices/feuilles/**/*.typ');
  const nestedSheet = sheetFiles.find(uri => path.relative(process.env.MPI_ENSEIGNEMENT_ROOT!, uri.fsPath).split(path.sep).length > 2) ?? sheetFiles[0];
  assert.ok(nestedSheet, 'Une feuille existante pour tester reveal');
  const revealed = await api.revealSheet(path.relative(process.env.MPI_ENSEIGNEMENT_ROOT!, nestedSheet.fsPath));
  assert.equal(revealed.source, path.relative(process.env.MPI_ENSEIGNEMENT_ROOT!, nestedSheet.fsPath), 'Sélection réelle de la feuille avec TreeView.reveal');
  console.log('Découverte et commandes vérifiées.');
}
