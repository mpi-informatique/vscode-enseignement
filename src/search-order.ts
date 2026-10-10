// Open files precede recently visited files; unknown files share the last rank.
export function searchPriority(file: string, opened: ReadonlySet<string>, recent: readonly string[]): number {
  const index = recent.indexOf(file);
  if (opened.has(file)) return index < 0 ? recent.length : index;
  return recent.length + 1 + (index < 0 ? recent.length : index);
}
