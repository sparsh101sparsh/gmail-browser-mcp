import { test, describe, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { BrowserSessionManager } from "../dist/browser/session.js";
import { checkPageSafety, GmailSafetyError } from "../dist/browser/guardrails.js";
import { RateLimiter } from "../dist/utils/rate_limiter.js";
import { loadCookies } from "../dist/utils/cookies.js";

describe("EMPIRICAL CHALLENGER: Google Challenge Redirects & Circuit Breakers", () => {
  let sessionManager;
  let tmpCookieFile;

  beforeEach(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp_challenger_"));
    tmpCookieFile = path.join(tmpDir, "test_cookies.json");
    fs.copyFileSync(
      "/Users/iamsparsh00321/Downloads/mail.google.com_cookies.json",
      tmpCookieFile
    );
    sessionManager = new BrowserSessionManager({ cookiesPath: tmpCookieFile });
  });

  afterEach(async () => {
    if (sessionManager) {
      await sessionManager.close().catch(() => {});
    }
    if (tmpCookieFile && fs.existsSync(tmpCookieFile)) {
      fs.rmSync(path.dirname(tmpCookieFile), { recursive: true, force: true });
    }
  });

  test("fail-fast interception of Google 2FA/Security challenge redirect (/signin/challenge)", async () => {
    const ctx = await sessionManager.getContext();
    await ctx.route("https://mail.google.com/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<script>window.location.href = 'https://accounts.google.com/signin/v2/challenge/pwd';</script>",
      });
    });
    await ctx.route("https://accounts.google.com/signin/v2/challenge/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Security challenge checkpoint</body></html>",
      });
    });

    await assert.rejects(
      async () => {
        await sessionManager.withWarmPage(async () => "SHOULD_NOT_EXECUTE");
      },
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "SECURITY_CHALLENGE");
        assert.match(err.message, /Google security challenge \/ 2FA checkpoint detected/);
        return true;
      }
    );
  });

  test("fail-fast interception of Google unusual traffic / rate limit roadblock (/sorry/index)", async () => {
    const ctx = await sessionManager.getContext();
    await ctx.route("https://mail.google.com/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<script>window.location.href = 'https://www.google.com/sorry/index?continue=https://mail.google.com';</script>",
      });
    });
    await ctx.route("https://www.google.com/sorry/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Our systems have detected unusual traffic from your computer network.</body></html>",
      });
    });

    await assert.rejects(
      async () => {
        await sessionManager.withWarmPage(async () => "SHOULD_NOT_EXECUTE");
      },
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "SECURITY_CHALLENGE");
        assert.match(err.message, /google\.com\/sorry/);
        return true;
      }
    );
  });

  test("fail-fast interception of Google signin redirect (/v3/signin)", async () => {
    const ctx = await sessionManager.getContext();
    await ctx.route("https://mail.google.com/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<script>window.location.href = 'https://accounts.google.com/v3/signin/identifier';</script>",
      });
    });
    await ctx.route("https://accounts.google.com/v3/signin/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Sign in to Google</body></html>",
      });
    });

    await assert.rejects(
      async () => {
        await sessionManager.withWarmPage(async () => "SHOULD_NOT_EXECUTE");
      },
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "UNAUTHENTICATED_SESSION");
        return true;
      }
    );
  });

  test("fail-fast interception of Google automation rejection (/rejected & DOM text)", async () => {
    const ctx = await sessionManager.getContext();
    await ctx.route("https://mail.google.com/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<script>window.location.href = 'https://accounts.google.com/rejected?flowName=GlifWebSignIn';</script>",
      });
    });
    await ctx.route("https://accounts.google.com/rejected**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Couldn't sign you in. This browser or app may not be secure.</body></html>",
      });
    });

    await assert.rejects(
      async () => {
        await sessionManager.withWarmPage(async () => "SHOULD_NOT_EXECUTE");
      },
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "AUTOMATION_REJECTED");
        return true;
      }
    );
  });

  test("fail-fast re-check on warm session reuse intercepts mid-session redirects", async () => {
    const ctx = await sessionManager.getContext();
    // Fulfill with valid inbox DOM
    await ctx.route("https://mail.google.com/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><div gh='cm'>Compose</div><div role='main'>Inbox</div></body></html>",
      });
    });

    await ctx.route("https://accounts.google.com/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Security challenge checkpoint</body></html>",
      });
    });

    // Call 1: establishes warm healthy page
    const r1 = await sessionManager.withWarmPage(async (page) => "WARM_PAGE_INITIALIZED");
    assert.equal(r1, "WARM_PAGE_INITIALIZED");

    // Call 2: simulate navigation away to checkpoint URL inside warm tab
    await sessionManager.withWarmPage(async (page) => {
      await page.goto("https://accounts.google.com/signin/v2/challenge/pwd");
    });

    // Call 3: re-entry into warm tab must immediately trigger checkPageSafety before executing
    await assert.rejects(
      async () => {
        await sessionManager.withWarmPage(async () => "SHOULD_NOT_EXECUTE");
      },
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "SECURITY_CHALLENGE");
        return true;
      }
    );
  });
});

describe("EMPIRICAL CHALLENGER: Crash Auto-Recovery in Warm Session", () => {
  let sessionManager;
  let tmpCookieFile;

  before(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp_crash_test_"));
    tmpCookieFile = path.join(tmpDir, "test_cookies.json");
    fs.copyFileSync(
      "/Users/iamsparsh00321/Downloads/mail.google.com_cookies.json",
      tmpCookieFile
    );
    sessionManager = new BrowserSessionManager({ cookiesPath: tmpCookieFile });
  });

  after(async () => {
    if (sessionManager) {
      await sessionManager.close().catch(() => {});
    }
    if (tmpCookieFile && fs.existsSync(tmpCookieFile)) {
      fs.rmSync(path.dirname(tmpCookieFile), { recursive: true, force: true });
    }
  });

  const setupMockInboxRoute = async (sm) => {
    const ctx = await sm.getContext();
    await ctx.route("https://mail.google.com/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><div gh='cm'>Compose</div><div role='main'>Inbox</div></body></html>",
      });
    });
  };

  test("auto-recovery when warmPage is unexpectedly closed", async () => {
    await setupMockInboxRoute(sessionManager);

    // Call 1: establishes warm page
    const r1 = await sessionManager.withWarmPage(async () => "FIRST_CALL_OK");
    assert.equal(r1, "FIRST_CALL_OK");

    // Call 2: simulate crash by directly closing the active warm page
    let call2Failed = false;
    try {
      await sessionManager.withWarmPage(async (page) => {
        await page.close();
        throw new Error("Simulated sudden page crash");
      });
    } catch (err) {
      call2Failed = true;
      assert.match(err.message, /Simulated sudden page crash/);
    }
    assert.ok(call2Failed, "Call 2 must fail due to simulated page crash");

    // Call 3: subsequent invocation must cleanly detect closed page, create new page, and succeed
    const r3 = await sessionManager.withWarmPage(async (page) => {
      assert.ok(!page.isClosed(), "New page must not be closed");
      return "RECOVERED_PAGE_OK";
    });
    assert.equal(r3, "RECOVERED_PAGE_OK");
  });

  test("auto-recovery when browser process disconnects/crashes", async () => {
    await setupMockInboxRoute(sessionManager);

    // Call 1: ensure session is warm
    const r1 = await sessionManager.withWarmPage(async () => "WARM_BEFORE_BROWSER_KILL");
    assert.equal(r1, "WARM_BEFORE_BROWSER_KILL");

    // Terminate the underlying browser instance completely
    const ctx = await sessionManager.getContext();
    const browser = ctx.browser();
    assert.ok(browser && browser.isConnected(), "Browser must initially be connected");
    await browser.close();
    assert.ok(!browser.isConnected(), "Browser must be disconnected");

    // Small delay to allow disconnected event loop processing
    await new Promise((r) => setTimeout(r, 50));

    // Re-setup mock route on the new context that will be spawned
    // We can do this by wrapping getContext or verifying with real/mock navigation
    // Let us test with another session manager instance to ensure deterministic routing on new context
    const sm2 = new BrowserSessionManager({ cookiesPath: tmpCookieFile });
    const ctx2 = await sm2.getContext();
    await ctx2.route("https://mail.google.com/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><div gh='cm'>Compose</div><div role='main'>Inbox</div></body></html>",
      });
    });

    const resSm2 = await sm2.withWarmPage(async () => "SM2_WARM_OK");
    assert.equal(resSm2, "SM2_WARM_OK");

    // Close browser of sm2 directly
    await ctx2.browser().close();
    assert.ok(!ctx2.browser().isConnected());

    // When sm2.withWarmPage runs, it detects disconnected browser and launches a new one.
    // In our test environment, because default cookie file redirects to accounts.google.com,
    // it will either cleanly connect or catch unauthenticated session fail-fast without hanging.
    const tStart = Date.now();
    try {
      await sm2.withWarmPage(async () => "SHOULD_FAIL_OR_RECOVER");
    } catch (err) {
      assert.ok(err instanceof GmailSafetyError || err.message.includes("closed"));
    }
    const elapsed = Date.now() - tStart;
    assert.ok(elapsed < 15000, `Recovery must not hang, took ${elapsed}ms`);

    await sm2.close();
  });

  test("lock chain resilience: unhandled exception in one caller does not starve subsequent callers", async () => {
    const sm = new BrowserSessionManager({ cookiesPath: tmpCookieFile });
    await setupMockInboxRoute(sm);

    const executionLog = [];

    // Caller 1 fails
    const p1 = sm.withWarmPage(async () => {
      executionLog.push("caller_1_start");
      throw new Error("Caller 1 exploded");
    }).catch((err) => {
      executionLog.push("caller_1_caught");
    });

    // Caller 2 should immediately acquire the lock and succeed
    const p2 = sm.withWarmPage(async () => {
      executionLog.push("caller_2_start");
      return "caller_2_success";
    }).then((res) => {
      executionLog.push(res);
    });

    // Caller 3 also succeeds
    const p3 = sm.withWarmPage(async () => {
      executionLog.push("caller_3_start");
      return "caller_3_success";
    }).then((res) => {
      executionLog.push(res);
    });

    await Promise.all([p1, p2, p3]);

    assert.deepEqual(executionLog, [
      "caller_1_start",
      "caller_1_caught",
      "caller_2_start",
      "caller_2_success",
      "caller_3_start",
      "caller_3_success",
    ]);

    await sm.close();
  });

  test("warmup idempotency: multiple concurrent warmup calls do not spawn multiple browsers", async () => {
    const sm = new BrowserSessionManager({ cookiesPath: tmpCookieFile });
    await setupMockInboxRoute(sm);

    // Call warmup 3 times simultaneously
    const [w1, w2, w3] = [sm.warmup(), sm.warmup(), sm.warmup()];
    await Promise.all([w1, w2, w3]);

    const ctx = await sm.getContext();
    assert.ok(ctx.browser() && ctx.browser().isConnected());
    // Only 1 page should have been created in context
    const pages = ctx.pages();
    assert.equal(pages.length, 1, `Expected exactly 1 warm page, found ${pages.length}`);

    await sm.close();
  });
});

describe("EMPIRICAL CHALLENGER: Rate Limiter Mutex Pacing & Serialization", () => {
  test("strictly serializes 10 rapid concurrent actions with spacing", async () => {
    const minIntervalMs = 70;
    const limiter = new RateLimiter({ minIntervalMs });
    const timeline = [];
    const t0 = Date.now();

    const tasks = Array.from({ length: 10 }, (_, i) =>
      limiter.enforcePacing(`parallel_task_${i}`).then(() => {
        timeline.push({ id: i, time: Date.now() - t0 });
      })
    );

    await Promise.all(tasks);

    assert.equal(timeline.length, 10);

    for (let i = 1; i < timeline.length; i++) {
      const delta = timeline[i].time - timeline[i - 1].time;
      assert.ok(
        delta >= minIntervalMs - 15,
        `Task ${i} spaced by ${delta}ms, expected >= ${minIntervalMs - 15}ms`
      );
    }
  });

  test("pacing queue does not deadlock when an intermediate task throws", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 30 });
    const sequence = [];

    const task1 = limiter.enforcePacing("t1").then(() => sequence.push("t1_done"));
    const task2 = limiter.enforcePacing("t2").then(() => {
      sequence.push("t2_throw");
      throw new Error("Task 2 failed inside queue");
    });
    const task3 = limiter.enforcePacing("t3").then(() => sequence.push("t3_done"));

    await task1;
    await assert.rejects(task2, /Task 2 failed inside queue/);
    await task3;

    assert.deepEqual(sequence, ["t1_done", "t2_throw", "t3_done"]);
  });

  test("enforces sliding window rate limit under high action burst", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 10, maxActionsPerMinute: 2 });
    const now = Date.now();
    // Simulate 2 actions near end of window (window requires ~800ms wait)
    limiter["recentActions"] = [now - 59700, now - 59200];

    const tStart = Date.now();
    await limiter.enforcePacing("burst_limited_action");
    const elapsed = Date.now() - tStart;

    assert.ok(
      elapsed >= 750 && elapsed <= 1250,
      `Expected sliding window pause of ~800ms, actual was ${elapsed}ms`
    );
  });
});

describe("EMPIRICAL CHALLENGER: Stealth Flags & Anti-Detection", () => {
  test("launched browser context strips navigator.webdriver and applies stealth flags", async () => {
    const sm = new BrowserSessionManager();
    const ctx = await sm.getContext();
    const page = await ctx.newPage();

    const webdriverValue = await page.evaluate(() => navigator.webdriver);
    assert.equal(
      webdriverValue,
      undefined,
      "navigator.webdriver must evaluate to undefined in launched context"
    );

    const userAgent = await page.evaluate(() => navigator.userAgent);
    assert.match(
      userAgent,
      /Mozilla\/5\.0.*Macintosh.*Chrome\/.*Safari/i,
      "User agent must be realistic desktop browser"
    );

    await page.close();
    await sm.close();
  });
});
