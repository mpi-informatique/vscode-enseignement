import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Bank } from './runner';
import { executionCommand } from './core';
import { EnvironmentCache } from './environment-cache';

const execute = promisify(execFile);
const cache = new EnvironmentCache<NodeJS.ProcessEnv>();
const watchers = new Map<string, vscode.FileSystemWatcher>();

export function disposeEnvironments(): void {
  for (const watcher of watchers.values()) watcher.dispose();
  watchers.clear();
  cache.clear();
}

function watch(bank: Bank): void {
  if (watchers.has(bank.root)) return;
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(bank.root), '**/*'));
  const invalidate = (uri: vscode.Uri) => {
    const parts = path.relative(bank.root, uri.fsPath).split(path.sep);
    if (parts.some(part => ['.git', '.direnv', '.vscode', 'build', 'tmp', '__pycache__', 'node_modules', '.DS_Store'].includes(part)) || uri.fsPath.endsWith('.log')) return;
    cache.invalidate(bank.root);
  };
  watcher.onDidChange(invalidate);
  watcher.onDidCreate(invalidate);
  watcher.onDidDelete(invalidate);
  watchers.set(bank.root, watcher);
}

function configuration(bank: Bank) {
  const config = vscode.workspace.getConfiguration('mpiEnseignement', bank.scope);
  let nix = config.get<string>('nixPath', 'nix');
  if (nix === 'nix') nix = ['/nix/var/nix/profiles/default/bin/nix', path.join(os.homedir(), '.nix-profile/bin/nix')].find(existsSync) ?? nix;
  const mode = config.get<'auto' | 'nix' | 'direct'>('execution', 'auto');
  const flake = existsSync(path.join(bank.root, 'flake.nix'));
  return { mode, flake, nix, python: config.get<string>('pythonPath', 'python3') };
}

export function buildCommand(bank: Bank, targets: string[]) {
  const { mode, flake, nix, python } = configuration(bank);
  return executionCommand(mode, flake, nix, python, targets);
}

// Fournir aux aperçus et à la création les mêmes packages que les exports Python.
// Réutiliser le résultat jusqu’à un changement des sources, du verrou ou des réglages.
export async function environment(bank: Bank): Promise<NodeJS.ProcessEnv> {
  if (!vscode.workspace.isTrusted) throw new Error('Autoriser cet espace de travail pour charger son environnement.');
  const { mode, flake, nix, python } = configuration(bank);
  if (mode === 'direct' || (mode === 'auto' && !flake)) return { ...process.env };
  watch(bank);
  return cache.get(bank.root, JSON.stringify({ mode, flake, nix, python }), async () => {
    const { stdout } = await execute(nix, ['develop', '.', '-c', python, '-c',
      'import json, os; print(json.dumps({k: os.environ[k] for k in ("TYPST_PACKAGE_PATH", "ENSEIGNEMENT_SOURCE") if k in os.environ}))'],
    { cwd: bank.root, timeout: 240_000, maxBuffer: 1_000_000 });
    return { ...process.env, ...JSON.parse(stdout) };
  });
}

export async function libraryRoot(bank: Bank): Promise<string> {
  if (existsSync(path.join(bank.root, 'lib/meta.typ'))) return bank.root;
  const root = (await environment(bank)).ENSEIGNEMENT_SOURCE;
  if (!root || !existsSync(path.join(root, 'lib/meta.typ'))) throw new Error('Bibliothèque publique introuvable : utiliser Nix ou définir ENSEIGNEMENT_SOURCE.');
  return root;
}
