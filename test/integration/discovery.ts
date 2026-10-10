import * as vscode from 'vscode';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import { identify } from '../../src/documents';
import { mkdtemp, mkdir, writeFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { until } from './helpers';

export async function run(api: any, extension: vscode.Extension<any>): Promise<void> {
  const manifest = extension.packageJSON.contributes;
  const commands = await vscode.commands.getCommands(true);
  assert.deepEqual(manifest.views.mpiEnseignement.map((view: { id: string }) => view.id), ['mpiEnseignement.current', 'mpiEnseignement.library', 'mpiEnseignement.sheets']);
  assert.equal(manifest.views.mpiEnseignement.at(-1).name, 'Documents');
  for (const section of ['current', 'library', 'sheets']) {
    await vscode.commands.executeCommand(`mpiEnseignement.${section}.focus`);
    assert.ok((await vscode.commands.getCommands(true)).includes(`workbench.actions.treeView.mpiEnseignement.${section}.collapseAll`));
    await vscode.commands.executeCommand(`mpiEnseignement.collapse${section}`);
  }
  for (const binding of manifest.keybindings) assert.ok(commands.includes(binding.command), binding.command);
  for (const item of manifest.menus['view/title']) {
    if (/toggle|collapse/.test(item.command)) assert.ok(!item.group.startsWith('navigation'));
    if (/reset/.test(item.command)) assert.ok(item.when.includes('searchActive'));
  }
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
  await parentWorkspace(api);
  console.log('Découverte et commandes vérifiées.');
}

async function parentWorkspace(api: any): Promise<void> {
  const parent = await realpath(await mkdtemp(path.join(tmpdir(), 'enseignement-parent-')));
  const roots = ['enseignement', 'enseignement-prive'].map(name => path.join(parent, name));
  const entries = () => api.getEntries().filter((entry: { bank: string }) => roots.includes(entry.bank));
  try {
    for (const root of roots) {
      await mkdir(path.join(root, 'scripts'), { recursive: true });
      await mkdir(path.join(root, 'templates'));
      await writeFile(path.join(root, 'scripts/build.py'), '');
      await writeFile(path.join(root, 'templates/td.typ'), '#show: feuille.with(type: "td")');
      await writeFile(path.join(root, 'exemple.typ'), '#let ex = (titre: "Exercice fictif",)');
    }
    assert.ok(vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders!.length, 0, { uri: vscode.Uri.file(parent) }));
    await until(() => entries().length === 2, 'Les deux dépôts doivent être découverts depuis leur dossier parent');
    assert.deepEqual(entries().map((entry: { bank: string }) => entry.bank).sort(), [...roots].sort());
    assert.ok(vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders!.length, 0, { uri: vscode.Uri.file(roots[0]) }));
    await until(() => !!vscode.workspace.workspaceFolders?.some(folder => folder.uri.fsPath === roots[0]), 'Le dépôt doit être ajouté à l’espace de travail');
    // The refresh command waits for the queued workspace discovery.
    await vscode.commands.executeCommand('mpiEnseignement.refresh');
    assert.equal(entries().length, 2, 'Un dépôt ouvert aussi directement ne doit pas apparaître deux fois');
  } finally {
    for (const root of [roots[0], parent]) {
      const index = vscode.workspace.workspaceFolders?.findIndex(folder => folder.uri.fsPath === root) ?? -1;
      if (index >= 0) {
        vscode.workspace.updateWorkspaceFolders(index, 1);
        await until(() => !vscode.workspace.workspaceFolders?.some(folder => folder.uri.fsPath === root), 'Le dossier doit être retiré de l’espace de travail');
        await vscode.commands.executeCommand('mpiEnseignement.refresh');
      }
    }
    await until(() => entries().length === 0, 'Les dépôts retirés doivent disparaître');
    await rm(parent, { recursive: true, force: true });
  }
}
