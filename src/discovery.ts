import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';

// A configured path is authoritative. Otherwise accept a repository opened
// directly, or repositories immediately inside a shared workspace folder.
export async function bankCandidates(folder: string, configured = ''): Promise<string[]> {
  const candidate = path.resolve(folder, configured || '.');
  const hasBuild = (root: string) => existsSync(path.join(root, 'scripts/build.py'));
  if (configured || hasBuild(candidate)) return hasBuild(candidate) ? [candidate] : [];
  const children = await readdir(candidate, { withFileTypes: true });
  return children.filter(child => !child.name.startsWith('.') && (child.isDirectory() || child.isSymbolicLink()))
    .map(child => path.join(candidate, child.name)).filter(hasBuild);
}
