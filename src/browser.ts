import * as vscode from 'vscode';
import * as path from 'node:path';
import { Bank } from './runner';
import { Exercise, Filters, duration, matches, normalize } from './core';
import { Folder, hierarchy, isFolder } from './tree';
import { SheetMember, memberItem } from './sheets';
import { typeLabel } from './documents';

export interface Source { bank: Bank; source: string; documentType?: string; ex?: Exercise; metadata?: Exercise[]; members?: SheetMember[]; compositionError?: string }
type Leaf = Source | SheetMember;
export type BrowserNode = Leaf | Folder<Leaf>;
export class Browser implements vscode.TreeDataProvider<BrowserNode>, vscode.Disposable {
  readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  entries: Source[] = [];
  filters: Filters = {};
  flat: boolean;
  private folders = new Map<string, Folder<Leaf>>();
  constructor(readonly category: 'exercices' | 'documents', private state: vscode.Memento) {
    this.flat = state.get(`flat.${category}`, false);
  }
  get visible(): Source[] { return this.search(''); }
  search(query: string): Source[] {
    return this.entries.filter(item => {
      if (this.filters.type && item.documentType !== this.filters.type) return false;
      const metadata = item.ex ? [item.ex] : item.metadata ?? [];
      if (!metadata.length) return !Object.entries(this.filters).some(([key, value]) => key !== 'type' && value) && normalize(item.source).includes(normalize(query));
      return metadata.some(ex => matches({ ...ex, titre: `${metadata[0].titre} ${ex.titre}`, fichier: `${item.source} ${ex.fichier}` }, query, this.filters));
    });
  }
  get searching(): boolean { return Object.values(this.filters).some(Boolean); }
  getParent(node: BrowserNode): BrowserNode | undefined {
    const id = this.getTreeItem(node).id;
    const find = (nodes: BrowserNode[], parent?: BrowserNode): BrowserNode | undefined => {
      for (const child of nodes) {
        if (this.getTreeItem(child).id === id) return parent;
        const found = find(this.getChildren(child), child);
        if (found) return found;
      }
      return undefined;
    };
    return find(this.getChildren());
  }
  getChildren(node?: BrowserNode): BrowserNode[] {
    if (node) return isFolder(node) ? node.children : 'members' in node ? node.members ?? [] : [];
    const entries = [...this.visible].sort((a, b) => (a.ex?.titre ?? a.source).localeCompare(b.ex?.titre ?? b.source, 'fr', { numeric: true }));
    // Derive every folder (and bank root) from files visible in this view.
    const banks = new Map(entries.map(item => [item.bank.root, item.bank]));
    const files: BrowserNode[] = this.flat ? entries : [];
    if (!this.flat) for (const bank of banks.values()) {
      const tree = hierarchy<Leaf>(entries.filter(item => item.bank.root === bank.root), item => item.source);
      const decorate = (nodes: BrowserNode[]) => { for (const node of nodes) if (isFolder(node)) {
        Object.assign(node, { bank, source: node.folder.slice(1) });
        decorate(node.children); node.folder = bank.root + node.folder;
      } };
      decorate(tree);
      const sort = (nodes: BrowserNode[]) => {
        nodes.sort((a, b) => Number(isFolder(b)) - Number(isFolder(a)) || (isFolder(a) ? a.title : a.source).localeCompare(isFolder(b) ? b.title : b.source, 'fr', { numeric: true }));
        for (const node of nodes) if (isFolder(node)) sort(node.children);
      };
      sort(tree);
      if (banks.size > 1) files.push(Object.assign({ folder: bank.root, title: bank.name, children: tree }, { bank, source: '' })); else files.push(...tree);
    }
    const folders = new Map<string, Folder<Leaf>>();
    const stable = (nodes: BrowserNode[]): BrowserNode[] => nodes.map(node => {
      if (!isFolder(node)) return node;
      node.children = stable(node.children);
      const folder = Object.assign(this.folders.get(node.folder) ?? node, node);
      folders.set(node.folder, folder); return folder;
    });
    const roots = stable(files); this.folders = folders; return roots;
  }
  getTreeItem(node: BrowserNode): vscode.TreeItem {
    if (isFolder(node)) {
      const item = new vscode.TreeItem(node.title, this.searching ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `${this.category}:${node.folder}`;
      item.resourceUri = vscode.Uri.file(node.folder);
      item.iconPath = new vscode.ThemeIcon('folder');
      item.contextValue = 'sourceFolder'; return item;
    }
    if ('sheet' in node) return memberItem(node);
    const { ex, bank, source } = node;
    const item = new vscode.TreeItem(ex?.titre ?? node.metadata?.[0]?.titre ?? path.basename(source, '.typ'), node.members?.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.id = `${bank.root}/${source}`;
    item.contextValue = ex ? 'exercice' : 'typstSource';
    item.resourceUri = vscode.Uri.file(path.join(bank.root, source));
    if (!ex) item.iconPath = new vscode.ThemeIcon('file-code');
    item.description = ex ? [ex.concours?.nom, `${ex.difficulte}/5`, duration(ex), ex.langages.join(', ')].filter(Boolean).join(' · ') : [node.documentType && typeLabel(node.documentType), this.flat && path.dirname(source)].filter(Boolean).join(' · ');
    item.tooltip = ex ? [ex.titre, source, ex.chapitres.join(', '), ex.niveaux.join(', ')].join('\n') : source;
    item.command = { command: 'mpiExercices.source', title: 'Afficher le fichier', arguments: [node] }; return item;
  }
  toggle(): void { this.flat = !this.flat; void this.state.update(`flat.${this.category}`, this.flat); this.changed.fire(); }
  dispose(): void { this.changed.dispose(); }
}
