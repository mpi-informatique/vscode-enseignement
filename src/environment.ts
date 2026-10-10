import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Bank } from './runner';
import { executionCommand } from './core';

const execute = promisify(execFile);
const pending = new Map<string, Promise<NodeJS.ProcessEnv>>();

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
// Mutualiser seulement les demandes simultanées : le verrou et les sources peuvent changer.
export async function environment(bank: Bank): Promise<NodeJS.ProcessEnv> {
  if (!vscode.workspace.isTrusted) throw new Error('Autoriser cet espace de travail pour charger son environnement.');
  const { mode, flake, nix, python } = configuration(bank);
  if (mode === 'direct' || (mode === 'auto' && !flake)) return { ...process.env };
  const existing = pending.get(bank.root);
  if (existing) return existing;
  const job = (async () => {
    const { stdout } = await execute(nix, ['develop', 'path:.', '-c', python, '-c',
      'import json, os; print(json.dumps({k: os.environ[k] for k in ("TYPST_PACKAGE_PATH", "ENSEIGNEMENT_SOURCE") if k in os.environ}))'],
    { cwd: bank.root, timeout: 240_000, maxBuffer: 1_000_000 });
    return { ...process.env, ...JSON.parse(stdout) };
  })();
  pending.set(bank.root, job);
  try { return await job; } finally { pending.delete(bank.root); }
}

export async function libraryRoot(bank: Bank): Promise<string> {
  if (existsSync(path.join(bank.root, 'lib/meta.typ'))) return bank.root;
  const root = (await environment(bank)).ENSEIGNEMENT_SOURCE;
  if (!root || !existsSync(path.join(root, 'lib/meta.typ'))) throw new Error('Bibliothèque publique introuvable : utiliser Nix ou définir ENSEIGNEMENT_SOURCE.');
  return root;
}
