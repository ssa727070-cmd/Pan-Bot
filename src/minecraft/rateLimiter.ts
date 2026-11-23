/** Small in-memory sliding-window limiter used to respect Discord's notification rate limits. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  public tryAcquire(key: string, intervalMs: number, now = Date.now()): boolean {
    const cutoff = now - Math.max(intervalMs, 0);
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (recent.length > 0) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  public reset(key?: string): void {
    if (key) this.hits.delete(key);
    else this.hits.clear();
  }

  public get size(): number {
    return this.hits.size;
  }
}

export const minecraftRateLimiter = new RateLimiter();
