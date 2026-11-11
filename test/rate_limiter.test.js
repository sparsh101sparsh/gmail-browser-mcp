import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter, humanType } from "../dist/utils/rate_limiter.js";

describe("RateLimiter and Pacing", () => {
  test("clamps search limit to maximum safe limit (30)", () => {
    const limiter = new RateLimiter({ maxSearchResults: 30 });
    assert.equal(limiter.clampSearchLimit(10), 10);
    assert.equal(limiter.clampSearchLimit(30), 30);
    assert.equal(limiter.clampSearchLimit(50), 30);
    assert.equal(limiter.clampSearchLimit(100), 30);
    assert.equal(limiter.clampSearchLimit(Infinity), 30);
    assert.equal(limiter.clampSearchLimit(0), 10);
    assert.equal(limiter.clampSearchLimit(-5), 10);
    assert.equal(limiter.clampSearchLimit(NaN), 10);
    assert.equal(limiter.clampSearchLimit(20.7), 20);
    assert.equal(limiter.clampSearchLimit(undefined), 10);
    assert.equal(limiter.clampSearchLimit("25"), 25);
    assert.equal(limiter.clampSearchLimit("100"), 30);
    assert.equal(limiter.clampSearchLimit("invalid"), 10);
  });

  test("enforces pacing delay between rapid actions", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 150 });
    const start = Date.now();
    await limiter.enforcePacing("action1");
    await limiter.enforcePacing("action2");
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 140, `Elapsed time should be at least ~150ms, was ${elapsed}ms`);
  });

  test("serializes concurrent enforcePacing calls and respects recordActionCompleted", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 100 });
    const start = Date.now();

    // Call two enforcePacing concurrently
    const p1 = limiter.enforcePacing("c1");
    const p2 = limiter.enforcePacing("c2");
    await Promise.all([p1, p2]);

    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 90, `Concurrent calls should be serialized by pacing queue, was ${elapsed}ms`);

    // Record action finished now
    limiter.recordActionCompleted();
    const t3Start = Date.now();
    await limiter.enforcePacing("c3");
    const t3Elapsed = Date.now() - t3Start;
    assert.ok(t3Elapsed >= 90, `c3 should wait for pacing gap after recordActionCompleted, was ${t3Elapsed}ms`);
  });

  test("humanType executes keystrokes with randomized delay", async () => {
    const typedChars = [];
    const delays = [];
    const mockLocator = {
      click: async () => {},
    };
    const mockPage = {
      keyboard: {
        type: async (char, options) => {
          typedChars.push(char);
          if (options && options.delay) {
            delays.push(options.delay);
          }
        },
      },
    };

    await humanType(mockPage, mockLocator, "test");
    assert.equal(typedChars.join(""), "test");
    assert.equal(delays.length, 4);
    for (const d of delays) {
      assert.ok(d >= 30 && d <= 70, `Delay ${d} should be within 30-70ms range`);
    }
  });
});
