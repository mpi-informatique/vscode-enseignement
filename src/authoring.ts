import * as vscode from 'vscode';
import * as path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import { Bank } from './runner';
import { Exercise, normalize, safeSource } from './core';
import { identify, sourceExclusions, typeLabel } from './documents';
import { exerciseFromTemplate, sheetFromTemplate, contestFromTemplate, creationPath, slug, vocabulary } from './typst';
import { libraryRoot } from './environment';

export interface BankEntry { bank: Bank; ex: Exercise }
const canceled = () => { throw new vscode.CancellationError(); };

async function input(title: string, value = '', validate?: (value: string) => string | undefined): Promise<string> {
  return (await vscode.window.showInputBox({ title, value, validateInput: value => validate?.(value) ?? (value.trim() ? undefined : 'Champ obligatoire.') })) ?? canceled();
}
async function select(title: string, values: string[], required = false): Promise<string[]> {
  const chosen = await vscode.window.showQuickPick(values.map(label => ({ label })), { title, canPickMany: true, placeHolder: required ? 'Sélectionnez au moins une valeur' : 'Facultatif : validez sans sélection si aucun' });
  if (!chosen) canceled();
  if (required && !chosen!.length) throw new Error('Sélectionnez au moins une valeur.');
  return chosen!.map(item => item.label);
}

export async function selectBank(banks: Bank[]): Promise<Bank> {
  if (!banks.length) throw new Error("Ouvrez d'abord un dépôt de documents Typst.");
  if (banks.length === 1) return banks[0];
  const chosen = await vscode.window.showQuickPick(banks.map(bank => ({ label: bank.name, description: bank.root, bank })), { title: 'Choisir un dépôt' });
  return chosen?.bank ?? canceled();
}

async function create(bank: Bank, relative: string, content: string): Promise<vscode.Uri> {
  safeSource(relative);
  const uri = vscode.Uri.file(path.join(bank.root, relative));
  const directory = vscode.Uri.file(path.dirname(uri.fsPath));
  let ancestor = directory.fsPath;
  while (ancestor !== bank.root) {
    try {
      const actual = await realpath(ancestor);
      if (!actual.startsWith(bank.root + path.sep)) throw new Error('Le dossier de destination doit rester dans la banque.');
      break;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; ancestor = path.dirname(ancestor); }
  }
  await vscode.workspace.fs.createDirectory(directory);
  const actual = await realpath(directory.fsPath);
  if (actual !== bank.root && !actual.startsWith(bank.root + path.sep)) throw new Error('Le dossier de destination doit rester dans la banque.');
  const edit = new vscode.WorkspaceEdit();
  edit.createFile(uri, { overwrite: false, ignoreIfExists: false });
  edit.insert(uri, new vscode.Position(0, 0), content);
  if (!await vscode.workspace.applyEdit(edit)) throw new Error('Création impossible : le fichier existe peut-être déjà.');
  const document = await vscode.workspace.openTextDocument(uri);
  await document.save();
  await vscode.window.showTextDocument(document);
  return uri;
}

export async function newExercise(bank: Bank, entries: BankEntry[], targetDirectory?: string): Promise<vscode.Uri> {
  const library = await libraryRoot(bank);
  const title = await input("Nouvel exercice — titre");
  const duplicate = entries.find(entry => entry.bank.root === bank.root && normalize(entry.ex.titre).trim() === normalize(title).trim());
  if (duplicate) { await vscode.window.showTextDocument(vscode.Uri.file(path.join(bank.root, duplicate.ex.fichier))); throw new Error('Un exercice porte déjà ce titre ; sa source a été ouverte pour comparaison.'); }
  const meta = await readFile(path.join(library, 'lib/meta.typ'), 'utf8');
  const chapters = await select('Chapitres / sujets', vocabulary(meta, 'chapitres-programme'), true);
  const algorithms = await select('Algorithmes', vocabulary(meta, 'algorithmes-programme'));
  const structures = await select('Structures de données', vocabulary(meta, 'structures-programme'));
  // Older banks do not yet export their language vocabulary.
  const languageOptions = meta.includes('#let langages-possibles = (') ? vocabulary(meta, 'langages-possibles') : ['C', 'OCaml', 'Python', 'SQL'];
  const languages = await select('Langages utilisés', languageOptions);
  const levels = await select('Niveaux', ['MPSI', 'MP2I', 'MPI', 'MP'], true);
  const difficultyChoice = await vscode.window.showQuickPick(['1', '2', '3', '4', '5'], { title: 'Difficulté (1 : application directe ; 5 : très difficile)' });
  if (!difficultyChoice) canceled();
  const minutesText = await input('Durée estimée en minutes (0 : non estimée)', '20', value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? undefined : 'Entrez un nombre entier positif ou nul.');
  const directory = targetDirectory ?? await chooseDirectory('exercices/banque');
  const identifier = await input('Identifiant unique (nom du fichier)', slug(title), value => /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(value) ? undefined : 'Utilisez des lettres minuscules, chiffres, tirets et traits de soulignement.');
  const existing = await vscode.workspace.findFiles(new vscode.RelativePattern(vscode.Uri.file(bank.root), '**/*.typ'), sourceExclusions);
  for (const uri of existing.filter(uri => path.basename(uri.fsPath, '.typ') === identifier)) {
    if (identify((await vscode.workspace.openTextDocument(uri)).getText(), path.relative(bank.root, uri.fsPath))?.kind === 'exercice') throw new Error(`L'identifiant ${identifier} existe déjà dans la banque.`);
  }
  const template = await readFile(path.join(bank.root, 'templates/exercice.typ'), 'utf8');
  return create(bank, creationPath(directory, identifier), exerciseFromTemplate(template, { title, chapters, algorithms, structures, languages, levels, difficulty: Number(difficultyChoice), minutes: Number(minutesText) || null }));
}

async function chooseDirectory(value = ''): Promise<string> {
  return (await vscode.window.showInputBox({ title: 'Dossier dans la banque (vide : racine)', value, validateInput: value => {
    try { creationPath(value, 'test'); return undefined; } catch { return 'Chemin relatif, sans espaces ni ..'; }
  } })) ?? canceled();
}

export async function documentTemplates(bank: Bank): Promise<{ label: string; description: string; type: string; text: string }[]> {
  const files = await vscode.workspace.findFiles(new vscode.RelativePattern(vscode.Uri.file(bank.root), 'templates/**/*.typ'));
  const templates = [];
  for (const uri of files) {
    const text = await readFile(uri.fsPath, 'utf8');
    const info = identify(text);
    if (info?.kind === 'document' && info.type !== 'exercice') templates.push({ label: typeLabel(info.type!), description: path.relative(bank.root, uri.fsPath), type: info.type!, text });
  }
  return templates.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

export async function newSheet(bank: Bank, directory?: string): Promise<vscode.Uri> {
  const templates = await documentTemplates(bank);
  if (!templates.length) throw new Error('Ajoutez un modèle déclarant son type dans templates/.');
  const template = await vscode.window.showQuickPick(templates, { title: 'Type de feuille / modèle' }) ?? canceled();
  const title = await input('Titre de la feuille', template.type === 'td' ? 'Travaux dirigés' : template.label);
  directory ??= await chooseDirectory(template.type === 'devoir' ? 'exercices/devoirs' : 'exercices/feuilles');
  const name = slug(title);
  const suggestedName = ['cours', 'cours-presentation'].includes(template.type) && !name.startsWith('cours-') ? `cours-${name}` : name;
  const identifier = await input('Nom du fichier de la feuille', suggestedName, value => /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(value) ? undefined : 'Utilisez des lettres minuscules, chiffres, tirets et traits de soulignement.');
  const composition = /^#import\s+"\/templates\/exercice.typ"/m.test(template.text);
  const content = composition ? sheetFromTemplate(template.text, title, []) : contestFromTemplate(template.text, title);
  return create(bank, creationPath(directory, identifier), content);
}
