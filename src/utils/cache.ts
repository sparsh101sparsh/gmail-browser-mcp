/**
 * High-Speed In-Memory Cache with TTL
 * Reduces redundant browser navigations and CDP queries for read-only operations
 * while providing deterministic cache invalidation on write/mutation actions.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();

  public get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  public set<T>(key: string, value: T, ttlMs: number = 30000): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  public invalidate(prefix?: string): void {
    if (!prefix) {
      this.store.clear();
      return;
    }

    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  public size(): number {
    return this.store.size;
  }
}

export const defaultCache = new MemoryCache();
