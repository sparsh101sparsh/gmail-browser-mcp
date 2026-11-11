import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RateLimiter } from "../dist/utils/rate_limiter.js";
import {
  normalizeCookies,
  validateCookies,
  detectAccountIndex,
  loadCookies,
} from "../dist/utils/cookies.js";
import { validateAttachments } from "../dist/services/attachments.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("Adversarial Challenge 1: RateLimiter & Concurrency Pacing", () => {
  test("enforces strict serialization across 10 rapid concurrent calls", async () => {
    const minIntervalMs = 80;
    const limiter = new RateLimiter({ minIntervalMs });
    const completionTimes = [];
    const start = Date.now();

    // Launch 10 concurrent requests simultaneously
    const tasks = Array.from({ length: 10 }, (_, i) =>
      limiter.enforcePacing(`rapid_concurrent_${i}`).then(() => {
        completionTimes.push({ index: i, timestamp: Date.now() - start });
      })
    );

    await Promise.all(tasks);

    assert.equal(completionTimes.length, 10, "All 10 tasks must complete");

    // Verify pacing delta between every consecutive pair
    for (let i = 1; i < completionTimes.length; i++) {
      const delta = completionTimes[i].timestamp - completionTimes[i - 1].timestamp;
      assert.ok(
        delta >= minIntervalMs - 15, // allow up to 15ms timer jitter
        `Pacing gap between task ${i - 1} and ${i} was ${delta}ms, expected >= ${minIntervalMs - 15}ms`
      );
    }
  });

  test("enforces sliding window throttling under high frequency", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 10, maxActionsPerMinute: 3 });
    const now = Date.now();
    // Simulate 3 recent actions near the edge of 60s window (remaining wait ~500ms + 500ms buffer = ~1000ms)
    limiter["recentActions"] = [now - 59500, now - 59000, now - 58500];

    const tStart = Date.now();
    await limiter.enforcePacing("throttled_action");
    const elapsed = Date.now() - tStart;

    assert.ok(
      elapsed >= 950 && elapsed <= 1300,
      `Expected sliding window pause of ~1000ms, actual was ${elapsed}ms`
    );
  });

  test("recovers cleanly from errors and avoids queue deadlock", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 50 });

    // Force an enqueued item that throws
    const pFail = limiter.enforcePacing("will_fail").then(() => {
      throw new Error("Simulated task error inside pacing window");
    });

    await assert.rejects(pFail, /Simulated task error/);

    // Subsequent call must still execute and not hang
    const tStart = Date.now();
    await limiter.enforcePacing("recovery_task");
    const elapsed = Date.now() - tStart;
    assert.ok(elapsed >= 35, `Queue should remain healthy and paced, elapsed was ${elapsed}ms`);
  });

  test("clamps search limit across adversarial inputs", () => {
    const limiter = new RateLimiter({ maxSearchResults: 30 });
    assert.equal(limiter.clampSearchLimit(-1), 10);
    assert.equal(limiter.clampSearchLimit(-999), 10);
    assert.equal(limiter.clampSearchLimit(0), 10);
    assert.equal(limiter.clampSearchLimit(0.5), 10);
    assert.equal(limiter.clampSearchLimit(15.9), 15);
    assert.equal(limiter.clampSearchLimit(30), 30);
    assert.equal(limiter.clampSearchLimit(31), 30);
    assert.equal(limiter.clampSearchLimit(1000000), 30);
    assert.equal(limiter.clampSearchLimit(Infinity), 30);
    assert.equal(limiter.clampSearchLimit(-Infinity), 10);
    assert.equal(limiter.clampSearchLimit(NaN), 10);
    assert.equal(limiter.clampSearchLimit("25"), 25);
    assert.equal(limiter.clampSearchLimit("   "), 10);
    assert.equal(limiter.clampSearchLimit("invalid"), 10);
    assert.equal(limiter.clampSearchLimit(null), 10);
    assert.equal(limiter.clampSearchLimit(undefined), 10);
    assert.equal(limiter.clampSearchLimit({}), 10);
    assert.equal(limiter.clampSearchLimit([]), 10);
  });
});

describe("Adversarial Challenge 2: Cookie Parsing, Normalization & Auth Validation", () => {
  let tmpDir;

  test.beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp_adv_cookies_"));
  });

  test.afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("rejects malformed cookie files (syntax errors, empty file, non-array)", () => {
    const syntaxErr = path.join(tmpDir, "syntax.json");
    fs.writeFileSync(syntaxErr, "{ bad json");
    assert.throws(() => loadCookies(syntaxErr), /Failed to parse cookies JSON/);

    const empty = path.join(tmpDir, "empty.json");
    fs.writeFileSync(empty, "");
    assert.throws(() => loadCookies(empty), /Failed to parse cookies JSON/);

    const obj = path.join(tmpDir, "obj.json");
    fs.writeFileSync(obj, JSON.stringify({ name: "SID", value: "x" }));
    assert.throws(() => loadCookies(obj), /Cookies file must contain a JSON array/);

    const nonExistent = path.join(tmpDir, "does_not_exist.json");
    assert.throws(() => loadCookies(nonExistent), /Gmail cookies file not found at/);
  });

  test("filters corrupted entries and normalizes raw attributes", () => {
    const raw = [
      null,
      undefined,
      42,
      "cookie_string",
      {},
      { name: "" },
      { name: "   ", value: "val" },
      { name: "valid_c1", value: "val1", sameSite: "NO_RESTRICTION" },
      { name: "valid_c2", value: "val2", sameSite: "none", secure: false },
      { name: "valid_c3", value: "val3", sameSite: "lax" },
      { name: "valid_c4", value: "val4", sameSite: "strict" },
      { name: "valid_c5", value: "val5", domain: "google.com" },
      { name: "valid_c6", value: "val6", expirationDate: 1750000000000 }, // ms
      { name: "valid_c7", value: "val7", expires: "2027-01-01T00:00:00Z" },
    ];

    const normalized = normalizeCookies(raw);
    assert.equal(normalized.length, 7);

    assert.equal(normalized[0].name, "valid_c1");
    assert.equal(normalized[0].sameSite, "None");
    assert.equal(normalized[0].secure, true);

    assert.equal(normalized[1].name, "valid_c2");
    assert.equal(normalized[1].sameSite, "None");
    assert.equal(normalized[1].secure, true);

    assert.equal(normalized[2].sameSite, "Lax");
    assert.equal(normalized[3].sameSite, "Strict");

    assert.equal(normalized[4].domain, ".google.com");
    assert.equal(normalized[5].expires, 1750000000);
    assert.equal(normalized[6].expires, Math.floor(Date.parse("2027-01-01T00:00:00Z") / 1000));
  });

  test("enforces critical auth cookie requirements", () => {
    // Missing SID
    const noSid = path.join(tmpDir, "no_sid.json");
    fs.writeFileSync(noSid, JSON.stringify([{ name: "GMAIL_AT", value: "at" }]));
    assert.throws(() => loadCookies(noSid), /Critical Google auth cookie 'SID' is missing/);

    // Expired SID
    const expSid = path.join(tmpDir, "exp_sid.json");
    fs.writeFileSync(
      expSid,
      JSON.stringify([
        { name: "SID", value: "sid", expires: 1000 },
        { name: "GMAIL_AT", value: "at" },
      ])
    );
    assert.throws(() => loadCookies(expSid), /Critical Google auth cookie 'SID' is expired/);

    // Missing GMAIL_AT
    const noGmailAt = path.join(tmpDir, "no_gmail_at.json");
    fs.writeFileSync(noGmailAt, JSON.stringify([{ name: "SID", value: "sid" }]));
    assert.throws(() => loadCookies(noGmailAt), /Critical Gmail action token 'GMAIL_AT' is missing/);

    // Expired GMAIL_AT
    const expGmailAt = path.join(tmpDir, "exp_gmail_at.json");
    fs.writeFileSync(
      expGmailAt,
      JSON.stringify([
        { name: "SID", value: "sid", expires: 2000000000 },
        { name: "GMAIL_AT", value: "at", expires: 1000 },
      ])
    );
    assert.throws(() => loadCookies(expGmailAt), /Critical Gmail action token 'GMAIL_AT' is expired/);

    // Missing HSID
    const noHsid = path.join(tmpDir, "no_hsid.json");
    fs.writeFileSync(
      noHsid,
      JSON.stringify([
        { name: "SID", value: "sid", expires: 2000000000 },
        { name: "GMAIL_AT", value: "at", expires: 2000000000 },
      ])
    );
    assert.throws(() => loadCookies(noHsid), /Critical Google auth cookie 'HSID' is missing/);

    // Expired HSID
    const expHsid = path.join(tmpDir, "exp_hsid.json");
    fs.writeFileSync(
      expHsid,
      JSON.stringify([
        { name: "SID", value: "sid", expires: 2000000000 },
        { name: "GMAIL_AT", value: "at", expires: 2000000000 },
        { name: "HSID", value: "hsid", expires: 1000 },
      ])
    );
    assert.throws(() => loadCookies(expHsid), /Critical Google auth cookie 'HSID' is expired/);

    // Missing SSID
    const noSsid = path.join(tmpDir, "no_ssid.json");
    fs.writeFileSync(
      noSsid,
      JSON.stringify([
        { name: "SID", value: "sid", expires: 2000000000 },
        { name: "GMAIL_AT", value: "at", expires: 2000000000 },
        { name: "HSID", value: "hsid", expires: 2000000000 },
      ])
    );
    assert.throws(() => loadCookies(noSsid), /Critical Google auth cookie 'SSID' is missing/);

    // Expired SSID
    const expSsid = path.join(tmpDir, "exp_ssid.json");
    fs.writeFileSync(
      expSsid,
      JSON.stringify([
        { name: "SID", value: "sid", expires: 2000000000 },
        { name: "GMAIL_AT", value: "at", expires: 2000000000 },
        { name: "HSID", value: "hsid", expires: 2000000000 },
        { name: "SSID", value: "ssid", expires: 1000 },
      ])
    );
    assert.throws(() => loadCookies(expSsid), /Critical Google auth cookie 'SSID' is expired/);
  });

  test("detects account index routing or environment overrides", () => {
    const c1 = [{ name: "GMAIL_AT", value: "x", path: "/mail/u/3" }];
    assert.equal(detectAccountIndex(c1), 3);

    const cDefault = [{ name: "SID", value: "x", path: "/" }];
    assert.equal(detectAccountIndex(cDefault), 1);

    process.env.GMAIL_ACCOUNT_INDEX = "4";
    try {
      assert.equal(detectAccountIndex(cDefault), 4);
    } finally {
      delete process.env.GMAIL_ACCOUNT_INDEX;
    }
  });
});

describe("Adversarial Challenge 3: Attachment Validation & Size Boundaries", () => {
  let tmpDir;

  test.beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp_adv_att_"));
  });

  test.afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("validates exact 25MB boundary condition (26,214,400 bytes)", () => {
    const exact25MB = path.join(tmpDir, "exact25MB.bin");
    const fd = fs.openSync(exact25MB, "w");
    fs.ftruncateSync(fd, 25 * 1024 * 1024); // exactly 26,214,400 bytes
    fs.closeSync(fd);

    const res = validateAttachments([exact25MB]);
    assert.equal(res.totalSizeBytes, 26214400);
    assert.equal(res.resolvedPaths.length, 1);
  });

  test("rejects files exceeding 25MB by 1 byte (26,214,401 bytes)", () => {
    const over25MB = path.join(tmpDir, "over25MB.bin");
    const fd = fs.openSync(over25MB, "w");
    fs.ftruncateSync(fd, 25 * 1024 * 1024 + 1); // 26,214,401 bytes
    fs.closeSync(fd);

    assert.throws(
      () => validateAttachments([over25MB]),
      /Total attachments size .* exceeds Gmail's 25MB limit/
    );
  });

  test("rejects cumulative multiple attachments exceeding 25MB", () => {
    const f1 = path.join(tmpDir, "f1.bin");
    const f2 = path.join(tmpDir, "f2.bin");

    const fd1 = fs.openSync(f1, "w");
    fs.ftruncateSync(fd1, 13 * 1024 * 1024); // 13MB
    fs.closeSync(fd1);

    const fd2 = fs.openSync(f2, "w");
    fs.ftruncateSync(fd2, 13 * 1024 * 1024); // 13MB (total 26MB)
    fs.closeSync(fd2);

    assert.throws(
      () => validateAttachments([f1, f2]),
      /Total attachments size .* exceeds Gmail's 25MB limit/
    );
  });

  test("rejects non-array inputs, 0-byte files, non-existent files, and directories", () => {
    assert.throws(() => validateAttachments(null), /attachment_paths must be an array/);
    assert.throws(() => validateAttachments(123), /attachment_paths must be an array/);
    assert.throws(() => validateAttachments("path.txt"), /attachment_paths must be an array/);
    assert.throws(() => validateAttachments({}), /attachment_paths must be an array/);

    const empty = path.join(tmpDir, "empty.txt");
    fs.writeFileSync(empty, "");
    assert.throws(() => validateAttachments([empty]), /Attachment file is empty \(0 bytes\)/);

    const nonExistent = path.join(tmpDir, "missing.txt");
    assert.throws(() => validateAttachments([nonExistent]), /Attachment file does not exist/);

    const dir = path.join(tmpDir, "subDir");
    fs.mkdirSync(dir);
    assert.throws(() => validateAttachments([dir]), /Attachment path is not a regular file/);
  });

  test("handles symlinks correctly", () => {
    const real = path.join(tmpDir, "real.txt");
    fs.writeFileSync(real, "sample data");

    const sym = path.join(tmpDir, "sym.txt");
    fs.symlinkSync(real, sym);

    const res = validateAttachments([sym]);
    assert.equal(res.totalSizeBytes, 11);

    const brokenSym = path.join(tmpDir, "broken_sym.txt");
    fs.symlinkSync("/tmp/non_existent_file_xyz_123", brokenSym);
    assert.throws(() => validateAttachments([brokenSym]), /Attachment file does not exist/);
  });
});

describe("Adversarial Challenge 4: MCP Protocol Discovery & Schema Compliance", () => {
  test("discovers all tools with valid schemas and handles bad requests via Stdio", async () => {
    const serverPath = path.resolve("dist/index.js");
    const transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      stderr: "pipe",
    });

    const client = new Client(
      { name: "test-adversarial-client", version: "1.0.0" },
      { capabilities: {} }
    );

    try {
      await client.connect(transport);

      const listResult = await client.listTools();
      const tools = listResult.tools;

      const requiredTools = ["send_email", "search_emails", "read_email", "check_session"];
      for (const name of requiredTools) {
        const found = tools.find((t) => t.name === name);
        assert.ok(found, `Tool '${name}' must be exposed via MCP discovery`);
        assert.equal(found.inputSchema.type, "object", `Tool '${name}' inputSchema must be 'object'`);
        assert.ok(found.description && found.description.length > 20, `Tool '${name}' must have detailed description`);
      }

      // Check specific required properties
      const sendEmail = tools.find((t) => t.name === "send_email");
      assert.deepEqual(sendEmail.inputSchema.required, ["to", "subject", "body"]);

      const searchEmails = tools.find((t) => t.name === "search_emails");
      assert.deepEqual(searchEmails.inputSchema.required, ["query"]);

      // Test invoking unknown tool
      const unknownResult = await client.callTool({
        name: "non_existent_tool_name",
        arguments: {},
      });
      assert.equal(unknownResult.isError, true, "Unknown tool invocation must return isError: true");

      // Test invoking send_email with missing parameters
      const sendMissingResult = await client.callTool({
        name: "send_email",
        arguments: {},
      });
      assert.equal(sendMissingResult.isError, true);
      assert.ok(sendMissingResult.content[0].text.includes("Recipient email address ('to') cannot be empty"));

      // Test invoking search_emails with missing query
      const searchMissingResult = await client.callTool({
        name: "search_emails",
        arguments: {},
      });
      assert.equal(searchMissingResult.isError, true);
      assert.ok(searchMissingResult.content[0].text.includes("Search query cannot be empty"));
    } finally {
      await client.close().catch(() => {});
    }
  });
});
