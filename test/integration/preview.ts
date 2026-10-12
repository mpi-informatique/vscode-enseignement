import * as vscode from 'vscode';
import * as path from 'node:path';
import { stat, rm, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Previews } from '../../src/preview';
import { Runner } from '../../src/runner';
import { errorStatus } from '../../src/errors';
import { forward } from '../../src/tinymist';
import { fixture, until } from './helpers';
export async function run(api: any, extension: vscode.Extension<any>): Promise<void> {
  const { temporary, previewBank, relative, generated, file } = await fixture();
  const previews = new Previews({ extensionUri: extension.extensionUri } as vscode.ExtensionContext, async () => undefined);
  const runner = new Runner();
  const sockets: WebSocket[] = [];
  try {
    const editor = await vscode.window.showTextDocument(vscode.Uri.file(file), { viewColumn: vscode.ViewColumn.One });
    const before = Date.now();
    const preview = await previews.open(previewBank, relative, 'enonce');
    assert.equal(preview.panel.title, 'test-creation.pdf');
    console.log('Démarrage aperçu (ms)', Date.now() - before);
    let frames = 0;
    const listener = preview.panel.webview.onDidReceiveMessage(message => { if (message.type === 'frameReady') frames++; });
    await until(() => frames > 0, "L'iframe Tinymist ne se charge pas");
    const enonce = preview.sessions.get('enonce')!;
    let documentOutline: any;
    enonce.connection.onNotification('tinymist/documentOutline', outline => { documentOutline = outline; });
    const socket = new WebSocket(`ws://127.0.0.1:${enonce.port}`);
    sockets.push(socket);
    const messages: Buffer[] = [];
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('message', event => { const data = typeof event.data === 'string' ? Buffer.from(event.data) : Buffer.from(event.data as ArrayBuffer); messages.push(data); });
    await until(() => socket.readyState === WebSocket.OPEN, 'Connexion au rendu Tinymist');
    socket.send('current');
    await until(() => messages.some(data => /^(new|diff-v1),/.test(data.toString())), 'Rendu vectoriel initial');
    const dark = [vscode.ColorThemeKind.Dark, vscode.ColorThemeKind.HighContrast].includes(vscode.window.activeColorTheme.kind);
    assert.ok(messages.some(data => data.toString().includes(`"rest":"${dark ? 'always' : 'never'}"`)), 'Thème de rendu correct');
    const count = messages.length;
    const edit = new vscode.WorkspaceEdit();
    const line = generated.split('\n').findIndex(text => text.includes('Un texte unique'));
    edit.insert(editor.document.uri, new vscode.Position(line, 7), 'MODIFICATION ');
    await vscode.workspace.applyEdit(edit);
    await until(() => messages.slice(count).some(data => /^(new|diff-v1),/.test(data.toString())), 'Mise à jour sans enregistrer');
    const startJump = messages.length;
    editor.selection = new vscode.Selection(line, 20, line, 20);
    await forward(enonce, editor);
    await until(() => messages.slice(startJump).some(data => data.toString().startsWith('jump,')), 'Saut source vers aperçu');
    await until(() => !!documentOutline?.items?.length, 'Plan exact produit par Tinymist');
    assert.ok(!JSON.stringify(documentOutline).includes('Repère du corrigé'), 'Énoncé sans solution');
    const headingLine = generated.split('\n').findIndex(text => text.includes('Repère du test'));
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    await enonce.connection.sendRequest('workspace/executeCommand', { command: 'tinymist.scrollPreview', arguments: [enonce.id, { event: 'sourceScrollBySpan', span: documentOutline.items[0].span }] });
    await until(() => vscode.window.activeTextEditor?.document.uri.fsPath === file && vscode.window.activeTextEditor.selection.start.line === headingLine, 'Saut inverse vers la position source exacte');
    await preview.toggleJumps();
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    const noJump = messages.length;
    await previews.sync(editor);
    await enonce.connection.sendRequest('workspace/executeCommand', { command: 'tinymist.scrollPreview', arguments: [enonce.id, { event: 'sourceScrollBySpan', span: documentOutline.items[0].span }] });
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(editor.selection.start.line, 0, 'Saut inverse désactivé');
    assert.ok(!messages.slice(noJump).some(data => data.toString().startsWith('jump,')), 'Saut direct désactivé');
    await preview.toggleJumps();
    await preview.select('corrige');
    assert.equal(preview.panel.title, 'test-creation-cor.pdf');
    let correctedOutline: any;
    preview.sessions.get('corrige')!.connection.onNotification('tinymist/documentOutline', outline => { correctedOutline = outline; });
    const secondEdit = new vscode.WorkspaceEdit();
    secondEdit.insert(editor.document.uri, new vscode.Position(line, 7), 'SUITE ');
    await vscode.workspace.applyEdit(secondEdit);
    await until(() => JSON.stringify(correctedOutline)?.includes('Repère du corrigé') ?? false, 'Le corrigé affiche réellement les solutions');
    assert.equal(preview.sessions.size, 2);
    const switchStart = Date.now();
    await preview.select('enonce');
    assert.equal(preview.sessions.get('enonce'), enonce, 'La bascule réutilise le compilateur');
    console.log('Bascule chaude (ms)', Date.now() - switchStart);
    const compilationMessages: string[] = [];
    const originalPost = preview.panel.webview.postMessage.bind(preview.panel.webview);
    preview.panel.webview.postMessage = message => { if (message.type === 'compileError') compilationMessages.push(message.message); return originalPost(message); };
    const validText = editor.document.getText();
    const invalid = new vscode.WorkspaceEdit();
    invalid.insert(editor.document.uri, editor.document.positionAt(validText.length), '\n#let broken = (');
    await vscode.workspace.applyEdit(invalid);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.ok(!compilationMessages.some(Boolean), 'Pas de bandeau pendant la saisie');
    await until(() => compilationMessages.some(Boolean), 'Erreur de compilation transmise au bandeau PDF');
    const repair = new vscode.WorkspaceEdit();
    repair.delete(editor.document.uri, new vscode.Range(editor.document.positionAt(validText.length), editor.document.positionAt(editor.document.getText().length)));
    await vscode.workspace.applyEdit(repair);
    await until(() => compilationMessages.at(-1) === '', 'Bandeau effacé après correction');
    preview.panel.webview.postMessage = originalPost;
    await assert.rejects(stat(path.join(temporary, 'build')), 'Aucun export PDF pour afficher ou basculer');
    await editor.document.save();
    await runner.run(previewBank, ['c', relative]);
    let journalOpened = 0;
    const originalShow = runner.output.show.bind(runner.output);
    runner.output.show = () => { journalOpened++; };
    await assert.rejects(runner.run(previewBank, ['missing-test-target']));
    assert.equal(journalOpened, 0, "L'erreur n'ouvre pas le journal automatiquement");
    await vscode.commands.executeCommand('mpiEnseignement.showErrorDetails');
    assert.equal(journalOpened, 0, "Le clic ouvre Problems, jamais le journal");
    errorStatus.clear(`build:${previewBank.root}:missing-test-target`);
    runner.output.show = originalShow;
    for (const variant of ['enonce', 'corrige']) assert.ok((await stat(path.join(temporary, 'build/exercices/banque/graphes/test-creation', `${variant}.pdf`))).size > 1000);
    const fallback = new Previews({ extensionUri: extension.extensionUri } as vscode.ExtensionContext, async () => undefined, () => false);
    try {
      const pdfPreview = await fallback.open(previewBank, relative, 'enonce');
      assert.equal(pdfPreview.jumps, false); assert.equal(pdfPreview.native, false);
      let pdfReady = 0;
      const pdfListener = pdfPreview.panel.webview.onDidReceiveMessage(message => { if (message.type === 'pdfError') console.error(message.error); if (message.type === 'pdfReady') pdfReady++; });
      pdfPreview.panel.reveal(vscode.ViewColumn.Beside);
      await pdfPreview.restart();
      await until(() => pdfReady > 0, 'PDF affiché sans Tinymist');
      await pdfPreview.toggleJumps(); assert.equal(pdfPreview.jumps, false);
      const firstRender = pdfReady;
      await pdfPreview.select('corrige');
      await until(() => pdfReady > firstRender, 'Corrigé PDF affiché sans Tinymist');
      pdfListener.dispose();
    } finally { fallback.dispose(); }
    await preview.toggleTheme();
    assert.equal(preview.dark, !dark, 'Thème inversé localement');
    const themed = preview.sessions.get('enonce')!;
    assert.notEqual(themed, enonce);
    const themedSocket = new WebSocket(`ws://127.0.0.1:${themed.port}`); sockets.push(themedSocket);
    const themedMessages: string[] = []; themedSocket.binaryType = 'arraybuffer';
    themedSocket.addEventListener('message', event => themedMessages.push(typeof event.data === 'string' ? event.data : Buffer.from(event.data as ArrayBuffer).toString()));
    await until(() => themedSocket.readyState === WebSocket.OPEN, 'Connexion au rendu avec thème inversé'); themedSocket.send('current');
    await until(() => themedMessages.some(data => data.includes(`"rest":"${dark ? 'never' : 'always'}"`)), 'Le moteur utilise le thème inversé');
    listener.dispose();
    if (process.env.PREVIEW_REVIEW) { console.log('Aperçu temporaire', enonce.url); await new Promise(resolve => setTimeout(resolve, 55_000)); }
    preview.panel.dispose();
    assert.equal(previews.entries.size, 0);
    const courseSource = 'support.typ';
    const courseUri = vscode.Uri.file(path.join(temporary, courseSource));
    await writeFile(courseUri.fsPath, `#import "/load.typ": cours-et-presentation, cours-seulement, presentation-seulement
#show: cours-et-presentation.with(titre: "Support fictif")
= Partie commune
== Contenu commun
Un contenu partagé entre les deux formats.
#cours-seulement[== Repère du cours
Une explication réservée au cours.]
#presentation-seulement[== Repère de la présentation
Une indication réservée à la présentation.]
`);
    const courseEditor = await vscode.window.showTextDocument(courseUri, { viewColumn: vscode.ViewColumn.One });
    const coursePreview = await previews.open(previewBank, courseSource, 'enonce');
    assert.equal(coursePreview.documentType, 'cours-presentation');
    assert.match(coursePreview.panel.webview.html, />Cours<\/button>/);
    assert.match(coursePreview.panel.webview.html, />Présentation<\/button>/);
    const courseSession = coursePreview.sessions.get('enonce');
    for (const [variant, marker, excluded, format] of [
      ['enonce', 'Repère du cours', 'Repère de la présentation', 'cours'],
      ['corrige', 'Repère de la présentation', 'Repère du cours', 'presentation']
    ] as const) {
      await coursePreview.select(variant);
      assert.equal(coursePreview.panel.title, `support-${format}.pdf`);
      let renderedOutline: unknown;
      coursePreview.sessions.get(variant)!.connection.onNotification('tinymist/documentOutline', outline => { renderedOutline = outline; });
      const edit = new vscode.WorkspaceEdit();
      edit.insert(courseUri, courseEditor.document.positionAt(courseEditor.document.getText().length), '\n');
      await vscode.workspace.applyEdit(edit);
      await until(() => JSON.stringify(renderedOutline)?.includes(marker) ?? false, `${format} : contenu propre au format affiché`);
      assert.ok(!JSON.stringify(renderedOutline).includes(excluded), `${format} : contenu de l'autre format absent`);
    }
    await coursePreview.select('enonce');
    assert.equal(coursePreview.sessions.get('enonce'), courseSession, 'La bascule cours/présentation réutilise la session');
    await courseEditor.document.save();
    coursePreview.panel.dispose();
    const courseFallback = new Previews({ extensionUri: extension.extensionUri } as vscode.ExtensionContext, async () => undefined, () => false);
    try {
      const pdf = await courseFallback.open(previewBank, courseSource, 'enonce');
      assert.equal(pdf.panel.title, 'support-cours.pdf');
      await pdf.select('corrige');
      assert.equal(pdf.panel.title, 'support-presentation.pdf');
      for (const format of ['cours', 'presentation']) assert.ok((await stat(path.join(temporary, 'build/support', `${format}.pdf`))).size > 1000);
    } finally { courseFallback.dispose(); }
    vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders!.length, 0, { uri: previewBank.scope, name: previewBank.name });
    await until(async () => {
      try { return (await api.revealSheet(courseSource)).bank.root === temporary; }
      catch { return false; }
    }, 'Le support cours/présentation est découvert');
    for (const [command, format] of [['enonce', 'cours'], ['corrige', 'presentation']]) {
      await vscode.commands.executeCommand(`mpiEnseignement.${command}`, courseUri);
      assert.equal(api.previewCount(), 1, 'Les commandes F5/F6 réutilisent le même panneau');
      assert.ok(vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.label === `support-${format}.pdf`)), `La commande ${command} affiche ${format}`);
    }
  } finally {
    for (const socket of sockets) socket.close();
    previews.dispose(); runner.dispose();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const index = vscode.workspace.workspaceFolders?.findIndex(folder => folder.uri.fsPath === temporary) ?? -1;
    if (index >= 0) vscode.workspace.updateWorkspaceFolders(index, 1);
    await rm(temporary, { recursive: true, force: true });
  }
  console.log('Aperçus et synchronisation vérifiés sur des documents fictifs.');
}
