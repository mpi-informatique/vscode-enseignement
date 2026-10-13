// Own background resources for one document. Taking a resource transfers ownership,
// even while it is starting; clearing disposes only the resources still in reserve.
export class Preparation<T extends { dispose(): void }> {
  private current?: { key: string; jobs: Map<string, { job: Promise<T | undefined>; controller: AbortController }> };
  private disposed = false;

  async warm(key: string, variants: string[], load: (variant: string, signal: AbortSignal) => Promise<T>, failed: (error: unknown) => void): Promise<void> {
    if (this.disposed) return;
    if (this.current?.key !== key) { this.clear(); this.current = { key, jobs: new Map() }; }
    const entry = this.current!;
    for (const variant of variants) {
      if (entry.jobs.has(variant)) continue;
      const controller = new AbortController();
      const job = Promise.resolve().then(() => load(variant, controller.signal)).catch(error => {
        if (entry.jobs.get(variant)?.job === job) entry.jobs.delete(variant);
        if (this.current === entry && !this.disposed) failed(error);
        return undefined;
      });
      entry.jobs.set(variant, { job, controller });
    }
    await Promise.all([...entry.jobs.values()].map(item => item.job));
  }

  take(key: string, variant: string): Promise<T | undefined> {
    if (this.current?.key !== key) return Promise.resolve(undefined);
    const item = this.current.jobs.get(variant);
    this.current.jobs.delete(variant);
    return item?.job ?? Promise.resolve(undefined);
  }

  clear(key?: string): void {
    if (key !== undefined && this.current?.key !== key) return;
    const entry = this.current;
    this.current = undefined;
    for (const { job, controller } of entry?.jobs.values() ?? []) {
      controller.abort();
      void job.then(resource => resource?.dispose());
    }
  }

  dispose(): void { this.disposed = true; this.clear(); }
}
