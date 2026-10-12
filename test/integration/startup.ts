import * as vscode from 'vscode';
import * as path from 'node:path';
import { writeFile, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { environment } from '../../src/environment';
import { Previews } from '../../src/preview';
import { fixture, until } from './helpers';

export async function run(_api: unknown, extension: vscode.Extension<unknown>): Promise<void> {
  const { temporary, previewBank, relative, generated, file } = await fixture();
  const previews = new Previews({ extensionUri: extension.extensionUri } as vscode.ExtensionContext, async () => undefined);
  const sockets: WebSocket[] = [];
  const fragment = path.join(path.dirname(file), 'fragment.typ');
  try {
    await writeFile(fragment, '#let content = [Version sur disque.]');
    await writeFile(file, '#import "./fragment.typ": content\n' + generated.replace('Un texte unique', '#content Un texte unique'));
    const unused = path.join(path.dirname(file), 'inutilise.typ');
    await writeFile(unused, '#ce-fichier-est-invalide(');
    await vscode.workspace.openTextDocument(vscode.Uri.file(unused));
    const dependency = await vscode.workspace.openTextDocument(vscode.Uri.file(fragment));
    const edit = new vscode.WorkspaceEdit();
    edit.replace(dependency.uri, new vscode.Range(dependency.positionAt(0), dependency.positionAt(dependency.getText().length)), '#let content = [#heading(level: 2)[Repère non enregistré]]');
    await vscode.workspace.applyEdit(edit);
    assert.equal(dependency.isDirty, true);

    const cold = performance.now();
    const initial = await environment(previewBank);
    console.log('Environnement Nix initial (ms)', Math.round(performance.now() - cold));
    const warm = performance.now();
    assert.equal(await environment(previewBank), initial);
    console.log('Environnement Nix réutilisé (ms)', Math.round(performance.now() - warm));
    // A source change on disk must invalidate the environment.
    const change = path.join(temporary, 'cache-test.typ');
    await writeFile(change, '// Source nouvelle');
    let refreshed = initial;
    await until(async () => { refreshed = await environment(previewBank); return refreshed !== initial; }, 'Invalidation de l’environnement après modification des sources');
    assert.equal(await environment(previewBank), refreshed);

    const begin = performance.now();
    const preview = await previews.open(previewBank, relative, 'enonce');
    console.log('Démarrage Tinymist avec environnement prêt (ms)', Math.round(performance.now() - begin));
    const enonce = preview.sessions.get('enonce')!;
    let outline = '';
    enonce.connection.onNotification('tinymist/documentOutline', value => { outline = JSON.stringify(value); });
    const update = new vscode.WorkspaceEdit();
    update.insert(dependency.uri, dependency.positionAt(dependency.getText().length), '\n// Nouvelle modification non enregistrée');
    await vscode.workspace.applyEdit(update);
    const socket = new WebSocket(`ws://127.0.0.1:${enonce.port}`);
    sockets.push(socket);
    let rendered = false;
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('message', event => {
      const data = typeof event.data === 'string' ? event.data : Buffer.from(event.data as ArrayBuffer).toString();
      if (/^(new|diff-v1),/.test(data)) rendered = true;
    });
    await until(() => socket.readyState === WebSocket.OPEN, 'Connexion à Tinymist');
    socket.send('current');
    await until(() => rendered, 'Rendu avec les modifications non enregistrées');
    console.log('Premier rendu vectoriel avec environnement prêt (ms)', Math.round(performance.now() - begin));
    try { await until(() => outline.includes('Repère non enregistré'), 'Import non enregistré conservé dans l’aperçu'); }
    catch (error) { console.error('Plan reçu', outline); throw error; }
    assert.ok(!vscode.languages.getDiagnostics(vscode.Uri.file(unused)).length, 'Un document propre ouvert par le catalogue ne doit pas être compilé par le moteur isolé');

    const other = performance.now();
    await preview.select('corrige');
    console.log('Premier changement de variante (ms)', Math.round(performance.now() - other));
    const corrige = preview.sessions.get('corrige')!;
    const again = performance.now();
    await preview.select('enonce');
    await preview.select('corrige');
    console.log('Deux changements de variante déjà démarrée (ms)', Math.round(performance.now() - again));
    assert.equal(preview.sessions.get('enonce'), enonce);
    assert.equal(preview.sessions.get('corrige'), corrige);
    assert.equal(preview.sessions.size, 2);
    console.log('Démarrage, cache Nix, imports non enregistrés et réutilisation des variantes validés');
  } finally {
    for (const socket of sockets) socket.close();
    previews.dispose();
    await vscode.window.showTextDocument(vscode.Uri.file(fragment));
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    await rm(temporary, { recursive: true, force: true });
  }
}
