import * as path from 'node:path';
import { readFile } from 'node:fs/promises';

export function copyDirectory(source: string): string {
  const parent = path.dirname(source);
  return path.basename(parent) === 'copies' ? path.dirname(parent) : parent;
}

// Même contrat que scripts/copies.py : CSV voisins du DS, sans base JSON séparée.
export async function copyInputs(source: string): Promise<string[]> {
  const args: string[] = [];
  for (const [input, filename] of [['notes', 'notes.csv'], ['recap', 'recapitulatif.csv']]) {
    let text = '';
    try { text = (await readFile(path.join(copyDirectory(source), filename), 'utf8')).replace(/^\uFEFF/, ''); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    args.push('--input', `${input}=${text}`);
  }
  return args;
}
