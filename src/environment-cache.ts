// Keep successful environments and share concurrent loads. A changed configuration
// or source tree replaces the entry without allowing an older load to restore it.
export class EnvironmentCache<T> {
  private entries = new Map<string, { signature: string; value: Promise<T> }>();

  get(root: string, signature: string, load: () => Promise<T>): Promise<T> {
    const previous = this.entries.get(root);
    if (previous?.signature === signature) return previous.value;
    const value = Promise.resolve().then(load);
    this.entries.set(root, { signature, value });
    void value.catch(() => {
      if (this.entries.get(root)?.value === value) this.entries.delete(root);
    });
    return value;
  }

  invalidate(root: string): void { this.entries.delete(root); }
  clear(): void { this.entries.clear(); }
}
