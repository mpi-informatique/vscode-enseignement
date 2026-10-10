import * as vscode from 'vscode';
import * as path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm, cp, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { exerciseFromTemplate } from '../../src/typst';
import { documentTemplates } from '../../src/authoring';

export async function fixture() {
  const bank = process.env.MPI_ENSEIGNEMENT_ROOT!;
  const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'enseignement-test-')));
  const previewBank = { root: temporary, name: 'Test isolé', scope: vscode.Uri.file(temporary) };
  try {
    for (const file of ['lib', 'templates', 'scripts', 'justfile', 'nix', 'flake.nix', 'flake.lock', 'typst.toml', 'enseignement.typ']) await cp(path.join(bank, file), path.join(temporary, file), { recursive: true });
    for (const directory of ['exercices/banque/graphes', 'exercices/feuilles', 'exercices/devoirs/2026-2027', 'exercices/concours']) await mkdir(path.join(temporary, directory), { recursive: true });
    const customTemplate = (await readFile(path.join(temporary, 'templates/devoir.typ'), 'utf8')).replace('type: "devoir"', 'type: "colle"');
    await writeFile(path.join(temporary, 'templates/colle.typ'), customTemplate);
    assert.deepEqual((await documentTemplates(previewBank)).map(template => template.type).sort(), ['colle', 'concours', 'devoir', 'td']);
    const relative = 'exercices/banque/graphes/test-creation.typ';
    const generated = exerciseFromTemplate(await readFile(path.join(bank, 'templates/exercice.typ'), 'utf8'), {
      title: 'Test création', chapters: ['graphes'], algorithms: [], structures: [], languages: [], levels: ['MPI'], difficulty: 2, minutes: 20
    }).replace('Énoncé à compléter.', '#heading(level: 2)[Repère du test]\n      Un texte unique avec une formule $x^2 + y^2 = z^2$.').replace('solution: none', 'solution: [#heading(level: 2)[Repère du corrigé] Une correction.]');
    const file = path.join(temporary, relative);
    await writeFile(file, generated);
    return { temporary, previewBank, customTemplate, relative, generated, file };
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
}

export async function until(condition: () => boolean | Promise<boolean>, message: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(message);
}
