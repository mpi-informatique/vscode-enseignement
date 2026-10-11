import * as vscode from 'vscode';

// One shared indicator; successful jobs only clear their own error.
class ErrorStatus implements vscode.Disposable {
  private entries = new Map<string, { title: string; message: string }>();
  private typing = false;
  private timer?: ReturnType<typeof setTimeout>;
  private editing = vscode.workspace.onDidChangeTextDocument(event => {
    if (!event.contentChanges.length || !event.document.uri.path.endsWith('.typ')) return;
    this.typing = true; this.item?.hide(); clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.typing = false; this.update(); }, 2000);
  });
  private reported = new WeakSet<object>();
  private item?: vscode.StatusBarItem;
  private command?: vscode.Disposable;
  has(error: unknown): boolean { return typeof error === 'object' && error !== null && this.reported.has(error); }
  set(key: string, title: string, error: unknown): void {
    if (error instanceof vscode.CancellationError) return;
    if (typeof error === 'object' && error !== null) this.reported.add(error);
    this.entries.delete(key);
    this.entries.set(key, { title, message: error instanceof Error ? error.message : String(error) });
    this.update();
  }
  clear(key: string): void { this.entries.delete(key); this.update(); }
  private update(): void {
    if (this.typing || !this.entries.size) { this.item?.hide(); return; }
    if (!this.item) {
      this.item = vscode.window.createStatusBarItem('mpiEnseignement.errors', vscode.StatusBarAlignment.Left, 10);
      this.item.name = 'Erreurs Exercices MPI';
      this.item.command = 'mpiEnseignement.showErrorDetails';
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      this.command = vscode.commands.registerCommand('mpiEnseignement.showErrorDetails', () => vscode.commands.executeCommand('workbench.actions.view.problems'));
    }
    const last = [...this.entries.values()].at(-1)!;
    this.item.text = `$(error) ${last.title}${this.entries.size > 1 ? ` (${this.entries.size})` : ''}`;
    this.item.tooltip = `${last.message}\n\nCliquer pour ouvrir Problems.`;
    this.item.show();
  }
  dispose(): void { clearTimeout(this.timer); this.editing.dispose(); this.item?.dispose(); this.command?.dispose(); this.entries.clear(); }
}
export const errorStatus = new ErrorStatus();
