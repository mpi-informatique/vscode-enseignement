export * from '@mpi-informatique/enseignement-core';
import { pdfFilename as exercisePdfFilename, safeSource, sourceId, type Variant } from '@mpi-informatique/enseignement-core';

export function outputVariant(variant: Variant, documentType?: string): string {
  return documentType === 'cours-presentation' ? (variant === 'enonce' ? 'cours' : 'presentation') : variant;
}

export function variantLabels(documentType?: string): Record<Variant, string> {
  return documentType === 'cours-presentation' ? { enonce: 'Cours', corrige: 'Présentation' } : { enonce: 'Énoncé', corrige: 'Corrigé' };
}

export function pdfFilename(source: string, variant: Variant, documentType?: string): string {
  safeSource(source);
  return documentType === 'cours-presentation' ? `${outputVariant(variant, documentType)}-${sourceId(source).replace(/^cours-/, '')}.pdf` : exercisePdfFilename(source, variant);
}

export function pdfTarget(source: string, variant: Variant, copy = false, documentType?: string): string {
  safeSource(source);
  const stem = source.slice(0, -4);
  const filename = copy && variant === 'corrige' ? pdfFilename(source, variant) : `${outputVariant(variant, documentType)}.pdf`;
  return `build/${stem}/${filename}`;
}

export function previewArguments(root: string, source: string, variant: Variant, direct = false, documentType?: string): string[] {
  safeSource(source);
  const input = documentType === 'cours-presentation' ? `format=${outputVariant(variant, documentType)}` : `corrige=${variant === 'corrige'}`;
  const args = ['--root', root, '--ignore-system-fonts', '--input', input];
  if (!direct) args.push('--input', `exercice=/${source}`);
  args.push(`${root}/${direct ? source : 'templates/fiche.typ'}`);
  return args;
}

export function executionCommand(mode: 'auto' | 'nix' | 'direct', flake: boolean, nix: string, python: string, targets: string[]): { command: string; args: string[] } {
  const args = ['scripts/build.py', ...targets];
  return mode === 'nix' || (mode === 'auto' && flake)
    ? { command: nix, args: ['develop', 'path:.', '-c', python, ...args] }
    : { command: python, args };
}

export interface TypstDiagnostic { file: string; line: number; column: number; message: string; warning: boolean }
export function parseDiagnostics(output: string): TypstDiagnostic[] {
  const result: TypstDiagnostic[] = [];
  let message = ''; let warning = false;
  for (const line of output.replace(/\x1b\[[0-9;]*m/g, '').split('\n')) {
    const heading = /^(error|warning): (.*)/.exec(line);
    if (heading) { message = heading[2]; warning = heading[1] === 'warning'; }
    const location = /(?:┌─|-->)[ \t]+(.+):(\d+):(\d+)\s*$/.exec(line);
    if (location && message) result.push({ file: location[1], line: Math.max(0, +location[2] - 1), column: Math.max(0, +location[3] - 1), message, warning });
  }
  return result;
}
