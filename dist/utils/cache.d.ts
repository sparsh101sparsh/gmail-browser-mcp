/**
 * High-Speed In-Memory Cache with TTL
 * Reduces redundant browser navigations and CDP queries for read-only operations
 * while providing deterministic cache invalidation on write/mutation actions.
 */
export interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}
export declare class MemoryCache {
    private store;
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T, ttlMs?: number): void;
    invalidate(prefix?: string): void;
    size(): number;
}
export declare const defaultCache: MemoryCache;
