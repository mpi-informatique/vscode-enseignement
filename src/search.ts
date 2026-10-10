import * as vscode from 'vscode';
import * as path from 'node:path';
import { Browser, Source } from './browser';
import { duration } from './core';
import { typeLabel } from './documents';
import { searchPriority } from './search-order';

interface Choice extends vscode.QuickPickItem { source: Source }
export function searchItem(source: Source): Choice {
  const ex = source.ex ?? source.metadata?.[0];
  const metadata = source.ex ? [source.ex] : source.metadata ?? [];
  const chapters = [...new Set(metadata.flatMap(ex => ex.chapitres))];
  const languages = [...new Set(metadata.flatMap(ex => ex.langages))];
  const levels = [...new Set(metadata.flatMap(ex => ex.niveaux))];
  return {
    label: ex?.titre ?? path.basename(source.source, '.typ'),
    description: `${source.bank.name} · ${source.source}`,
    detail: [source.documentType && typeLabel(source.documentType), ex?.concours && Object.values(ex.concours).filter(value => typeof value !== 'boolean').join(' '),
      source.members && `${source.members.length} exercices`, source.ex && `${source.ex.difficulte}/5`,
      ex && duration(ex), levels.join(', '), languages.join(', '), chapters.join(', ')].filter(Boolean).join(' · '),
    source,
    // The bank matcher handles accents, multiple words and member metadata.
    alwaysShow: true
  };
}

export class RecentSources implements vscode.Disposable {
  private paths: string[];
  private subscription: vscode.Disposable;
  constructor(private state: vscode.Memento) {
    this.paths = state.get<string[]>('recentSources', []);
    this.subscription = vscode.window.onDidChangeActiveTextEditor(editor => this.track(editor));
    this.track(vscode.window.activeTextEditor);
  }
  private track(editor: vscode.TextEditor | undefined): void {
    const uri = editor?.document.uri;
    if (uri?.scheme !== 'file' || !uri.path.endsWith('.typ')) return;
    const file = uri.fsPath;
    this.paths = [file, ...this.paths.filter(item => item !== file)].slice(0, 200);
    void this.state.update('recentSources', this.paths);
  }
  get recent(): readonly string[] { return this.paths; }
  dispose(): void { this.subscription.dispose(); }
}

export function searchPicker(browser: Browser, history?: RecentSources): Promise<Source | undefined> {
  const picker = vscode.window.createQuickPick<Choice>();
  // VS Code exposes this at runtime but omits it from the public typings.
  // Keep our priority order when the query changes instead of sorting by label.
  (picker as vscode.QuickPick<Choice> & { sortByLabel: boolean }).sortByLabel = false;
  picker.title = `Rechercher : ${browser.category === 'exercices' ? 'exercices' : 'documents'}`;
  picker.placeholder = 'Titre, chemin, concours, chapitre… Entrée : ouvrir le fichier sélectionné.';
  const refresh = () => {
    // Tabs, unlike textDocuments, exclude documents loaded by the catalogue scan.
    const opened = new Set(vscode.window.tabGroups.all.flatMap(group => group.tabs.flatMap(tab => {
      const input = tab.input;
      return input instanceof vscode.TabInputText ? [input.uri.fsPath]
        : input instanceof vscode.TabInputTextDiff ? [input.modified.fsPath] : [];
    })));
    const recent = history?.recent ?? [];
    const priority = (item: Choice) => searchPriority(path.join(item.source.bank.root, item.source.source), opened, recent);
    const items = browser.search(picker.value).map(searchItem).sort((a, b) =>
      priority(a) - priority(b) || a.label.localeCompare(b.label, 'fr', { numeric: true }));
    picker.items = items;
    picker.activeItems = items.slice(0, 1);
  };
  return new Promise(resolve => {
    let result: Source | undefined;
    const subscriptions = [picker.onDidChangeValue(refresh), browser.onDidChangeTreeData(refresh),
      picker.onDidAccept(() => {
        result = (picker.selectedItems[0] ?? picker.activeItems[0])?.source;
        if (result) picker.hide();
      }),
      picker.onDidHide(() => { for (const subscription of subscriptions) subscription.dispose(); picker.dispose(); resolve(result); })];
    refresh(); picker.show();
  });
}
