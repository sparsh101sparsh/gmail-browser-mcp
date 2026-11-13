import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MemoryCache } from "../dist/utils/cache.js";

describe("In-Memory TTL Cache Test Suite", () => {
  test("stores and retrieves cached items", () => {
    const cache = new MemoryCache();
    cache.set("test_key", { data: 123 }, 5000);
    assert.deepStrictEqual(cache.get("test_key"), { data: 123 });
  });

  test("expires items past TTL", async () => {
    const cache = new MemoryCache();
    cache.set("short_lived", "hello", 50);
    assert.strictEqual(cache.get("short_lived"), "hello");

    await new Promise((res) => setTimeout(res, 60));
    assert.strictEqual(cache.get("short_lived"), undefined);
  });

  test("invalidates by prefix", () => {
    const cache = new MemoryCache();
    cache.set("stats:unread", 5, 5000);
    cache.set("stats:total", 100, 5000);
    cache.set("thread:123", "abc", 5000);

    cache.invalidate("stats:");
    assert.strictEqual(cache.get("stats:unread"), undefined);
    assert.strictEqual(cache.get("stats:total"), undefined);
    assert.strictEqual(cache.get("thread:123"), "abc");
  });

  test("clears entire cache on unconditional invalidate", () => {
    const cache = new MemoryCache();
    cache.set("k1", 1, 5000);
    cache.set("k2", 2, 5000);
    cache.invalidate();
    assert.strictEqual(cache.size(), 0);
  });
});
