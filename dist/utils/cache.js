/**
 * High-Speed In-Memory Cache with TTL
 * Reduces redundant browser navigations and CDP queries for read-only operations
 * while providing deterministic cache invalidation on write/mutation actions.
 */
export class MemoryCache {
    store = new Map();
    get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key, value, ttlMs = 30000) {
        this.store.set(key, {
            value,
            expiresAt: Date.now() + ttlMs,
        });
    }
    invalidate(prefix) {
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
    size() {
        return this.store.size;
    }
}
export const defaultCache = new MemoryCache();
//# sourceMappingURL=cache.js.map