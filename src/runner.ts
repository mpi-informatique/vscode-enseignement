import * as vscode from 'vscode';
import * as path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { parseDiagnostics } from './core';
import { buildCommand } from './environment';
import { errorStatus } from './errors';

export interface Bank { root: string; name: string; scope: vscode.Uri }

export class Runner implements vscode.Disposable {
  private queues = new Map<string, Promise<unknown>>();
  private children = new Set<ChildProcess>();
  private disposed = false;
  private errorKeys = new Set<string>();
  readonly output = vscode.window.createOutputChannel('Exercices MPI');
  readonly diagnostics = vscode.languages.createDiagnosticCollection('enseignement');

  run(bank: Bank, targets: string[]): Promise<void> {
    const previous = this.queues.get(bank.root) ?? Promise.resolve();
    const key = `build:${bank.root}:${targets.join('|')}`;
    this.errorKeys.add(key);
    const job = previous.catch(() => undefined).then(() => this.execute(bank, targets)).then(() => { errorStatus.clear(key); }, error => {
      if (!this.disposed) errorStatus.set(key, targets[0] === 'catalogue' ? 'Erreur catalogue' : 'Erreur compilation', error);
      throw error;
    });
    this.queues.set(bank.root, job);
    void job.finally(() => { if (this.queues.get(bank.root) === job) this.queues.delete(bank.root); }).catch(() => undefined);
    return job;
  }

  private async execute(bank: Bank, targets: string[]): Promise<void> {
    if (this.disposed) return;
    if (!vscode.workspace.isTrusted) throw new Error('Autorisez ce dossier dans VS Code pour compiler.');
    const { command, args } = buildCommand(bank, targets);
    this.output.appendLine(`\n[${bank.name}] ${command} ${args.join(' ')}`);
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Exercices MPI : ${targets[0] === 'catalogue' ? 'catalogue' : 'compilation'}`, cancellable: true }, async (_progress, token) => {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, { cwd: bank.root, shell: false, detached: process.platform !== 'win32', env: { ...process.env, NO_COLOR: '1' } });
        this.children.add(child);
        let output = '';
        child.stdout?.setEncoding('utf8'); child.stderr?.setEncoding('utf8');
        const collect = (text: string) => { this.output.append(text); output = (output + text).slice(-2_000_000); };
        child.stdout?.on('data', collect);
        child.stderr?.on('data', collect);
        const cancellation = token.onCancellationRequested(() => this.stop(child));
        child.once('error', error => {
          this.children.delete(child); cancellation.dispose();
          reject(new Error(`Impossible de lancer ${command} : ${error.message}. Vérifiez les réglages Exercices MPI.`));
        });
        child.once('close', code => {
          this.children.delete(child); cancellation.dispose();
          if (this.disposed || token.isCancellationRequested) { reject(new vscode.CancellationError()); return; }
          this.updateDiagnostics(bank, output);
          if (code === 0) resolve();
          else {
            const diagnostic = parseDiagnostics(output).find(item => !item.warning);
            const detail = diagnostic ? `${diagnostic.file}:${diagnostic.line + 1} : ${diagnostic.message}` : output.trim().split('\n').slice(-8).join('\n');
            reject(new Error(`La compilation a échoué (code ${code}).\n${detail}`));
          }
        });
      });
    });
  }

  private updateDiagnostics(bank: Bank, output: string): void {
    this.diagnostics.forEach(uri => { if (uri.fsPath.startsWith(bank.root + path.sep)) this.diagnostics.delete(uri); });
    const grouped = new Map<string, vscode.Diagnostic[]>();
    for (const item of parseDiagnostics(output)) {
      const file = path.resolve(bank.root, item.file);
      if (!file.startsWith(bank.root + path.sep)) continue;
      const diagnostic = new vscode.Diagnostic(new vscode.Range(item.line, item.column, item.line, item.column + 1), item.message, item.warning ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error);
      diagnostic.source = 'Typst';
      grouped.set(file, [...(grouped.get(file) ?? []), diagnostic]);
    }
    for (const [file, entries] of grouped) this.diagnostics.set(vscode.Uri.file(file), entries);
  }

  private stop(child: ChildProcess): void {
    try {
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM');
      else child.kill();
    } catch { /* The process may already have exited. */ }
  }
  dispose(): void { this.disposed = true; for (const key of this.errorKeys) errorStatus.clear(key); for (const child of this.children) this.stop(child); this.output.dispose(); this.diagnostics.dispose(); }
}
