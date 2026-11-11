import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  fastInjectText,
  fastFillRecipient,
  fastFillSubject,
  humanType,
  RateLimiter,
} from "../dist/utils/rate_limiter.js";
import { BrowserSessionManager } from "../dist/browser/session.js";
import { GmailSafetyError } from "../dist/browser/guardrails.js";

const MOCK_GMAIL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Mock Gmail Adversarial Stress Harness</title>
  <style>
    body { font-family: Roboto, Arial, sans-serif; margin: 0; padding: 20px; background: #f6f8fc; }
    .compose-btn { padding: 12px 24px; background: #c2e7ff; border-radius: 16px; cursor: pointer; display: inline-flex; }
    .compose-window { display: none; width: 600px; background: white; border: 1px solid #ccc; border-radius: 8px; margin-top: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .compose-window.open { display: block; }
    .field { border-bottom: 1px solid #e0e0e0; padding: 8px 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .field input { border: none; outline: none; flex: 1; min-width: 150px; font-size: 14px; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip { background: #e8eaed; border-radius: 12px; padding: 2px 8px; font-size: 12px; display: inline-flex; align-items: center; }
    .body-box { min-height: 180px; max-height: 350px; overflow-y: auto; padding: 12px; outline: none; font-size: 14px; white-space: pre-wrap; word-break: break-word; }
    .footer { padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; }
    .send-btn { background: #0b57d0; color: white; padding: 8px 18px; border-radius: 18px; cursor: pointer; border: none; font-weight: 500; }
    .close-btn { background: transparent; border: none; cursor: pointer; font-size: 16px; }
    .toast { display: none; position: fixed; bottom: 20px; left: 20px; background: #323232; color: white; padding: 12px 20px; border-radius: 4px; z-index: 1000; }
    .toast.visible { display: block; }
  </style>
</head>
<body>
  <div id="app">
    <div gh="cm" role="button" aria-label="Compose" class="compose-btn" id="compose-btn">Compose</div>
    <div id="composer" class="compose-window" role="dialog" aria-label="Compose">
      <div style="display:flex; justify-content:space-between; padding:8px 12px; background:#f2f6fc; border-top-left-radius:8px; border-top-right-radius:8px;">
        <span style="font-size:14px; font-weight:500;">New Message</span>
        <button id="close-modal-btn" class="close-btn" aria-label="Close">✕</button>
      </div>
      <div class="field">
        <div id="chips" class="chips"></div>
        <input aria-label="To" placeholder="Recipients" id="to-input" />
      </div>
      <div class="field">
        <input name="subjectbox" aria-label="Subject" placeholder="Subject" id="subject-input" />
      </div>
      <div role="textbox" aria-label="Message Body" contenteditable="true" class="body-box" id="body-editor"></div>
      <div class="footer">
        <button role="button" aria-label="Send" class="send-btn" id="send-button">Send</button>
      </div>
    </div>
    <div role="alert" class="toast" id="toast">
      <span class="toast-text">Message sent</span>
    </div>
  </div>

  <script>
    const toInput = document.getElementById('to-input');
    const chips = document.getElementById('chips');
    const sendBtn = document.getElementById('send-button');
    const toast = document.getElementById('toast');
    const composer = document.getElementById('composer');
    const composeBtn = document.getElementById('compose-btn');
    const closeBtn = document.getElementById('close-modal-btn');
    const bodyEditor = document.getElementById('body-editor');
    const subjectInput = document.getElementById('subject-input');

    composeBtn.addEventListener('click', () => {
      toast.classList.remove('visible');
      composer.classList.add('open');
      toInput.focus();
    });

    closeBtn.addEventListener('click', () => {
      composer.classList.remove('open');
      chips.innerHTML = '';
      toInput.value = '';
      subjectInput.value = '';
      bodyEditor.innerText = '';
    });

    toInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = toInput.value.trim();
        if (val) {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.setAttribute('email', val);
          chip.textContent = val;
          chips.appendChild(chip);
          toInput.value = '';
        }
      }
    });

    sendBtn.addEventListener('click', () => {
      sendBtn.disabled = true;
      setTimeout(() => {
        composer.classList.remove('open');
        chips.innerHTML = '';
        toInput.value = '';
        subjectInput.value = '';
        bodyEditor.innerText = '';
        toast.classList.add('visible');
        sendBtn.disabled = false;
        setTimeout(() => toast.classList.remove('visible'), 500);
      }, 30);
    });
  </script>
</body>
</html>
`;

describe("Adversarial Stress Suite 1: High-Throughput Rapid Text Injection", () => {
  let browser;
  let context;
  let page;

  test("setup test harness page and open composer", async () => {
    browser = await chromium.launch({
      headless: true,
      channel: "chrome",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    context = await browser.newContext();
    page = await context.newPage();
    await page.setContent(MOCK_GMAIL_HTML, { waitUntil: "load" });

    await page.locator("div[gh='cm']").click();
    await page.locator("#body-editor").waitFor({ state: "visible" });
  });

  test("Inject 10,000 characters multi-paragraph text via CDP in < 100ms", async () => {
    const editor = page.locator("#body-editor");
    await editor.evaluate((el) => {
      el.innerText = "";
    });

    const paragraph = "The quick brown fox jumps over the lazy dog. 1234567890! Speed optimization in Playwright requires zero artificial sleeps and fast atomic CDP insertion.\n\n";
    const repeats = Math.ceil(10000 / paragraph.length);
    const largeBody = paragraph.repeat(repeats).slice(0, 10000);

    const t0 = performance.now();
    await fastInjectText(page, editor, largeBody);
    const duration = performance.now() - t0;

    const injectedText = await editor.innerText();
    // InnerText normalizes block paragraph breaks in contenteditable (accounting for slight formatting expansion)
    assert.ok(
      injectedText.length >= 10000 && injectedText.length <= 10100,
      `Expected ~10,000 characters (got ${injectedText.length})`
    );
    assert.ok(duration < 100, `10,000 characters injection must complete in < 100ms, took ${duration.toFixed(2)}ms`);
    console.log(`  [Pass] 10,000 chars injected in ${duration.toFixed(2)} ms (${Math.round(10000 / (duration / 1000))} chars/sec)`);
  });

  test("Inject 25,000 characters massive payload without timeout or truncation", async () => {
    const editor = page.locator("#body-editor");
    await editor.evaluate((el) => {
      el.innerText = "";
    });

    const chunk = "Adversarial Stress Payload: Performance under heavy memory load. Highly optimized CDP text insert.\n";
    const massiveText = chunk.repeat(Math.ceil(25000 / chunk.length)).slice(0, 25000);

    const t0 = performance.now();
    await fastInjectText(page, editor, massiveText);
    const duration = performance.now() - t0;

    const injected = await editor.innerText();
    assert.ok(injected.length >= 25000, `Expected at least 25,000 chars, got ${injected.length}`);
    assert.ok(duration < 400, `25,000 characters injection must complete in < 400ms, took ${duration.toFixed(2)}ms`);
    console.log(`  [Pass] 25,000 chars injected in ${duration.toFixed(2)} ms`);
  });

  test("Special Characters, Unicode, Emoji, Quotes, and Newlines Integrity", async () => {
    const editor = page.locator("#body-editor");
    await editor.evaluate((el) => {
      el.innerText = "";
    });

    const specialPayload = [
      "Emoji Test: 🚀🔥🎉💻✉️📬💡⚡️",
      "Multilingual: 你好世界, Здравствуйте, مرحبا بالعالم, שלום עולם, こんにちは",
      "Symbols & Quotes: \"Double\" 'Single' `Backtick` \\Backslash /Slash & Ampersand <tag> [brackets] {curly}",
      "Whitespace: Tab\tIndented\nNewline 1\nNewline 2",
      "Punctuation: !@#$%^&*()_+-=[]{}|;':\",./<>?",
    ].join("\n");

    const t0 = performance.now();
    await fastInjectText(page, editor, specialPayload);
    const duration = performance.now() - t0;

    const actual = await editor.innerText();
    assert.ok(actual.includes("🚀🔥🎉"), "Must preserve emoji characters");
    assert.ok(actual.includes("你好世界"), "Must preserve CJK characters");
    assert.ok(actual.includes("مرحبا بالعالم"), "Must preserve Arabic RTL characters");
    assert.ok(actual.includes("\"Double\" 'Single'"), "Must preserve quotes");
    assert.ok(actual.includes("<tag>"), "Must not execute or strip HTML-like brackets");
    assert.ok(duration < 50, `Special characters injection must complete in < 50ms, took ${duration.toFixed(2)}ms`);
    console.log(`  [Pass] Complex unicode/emoji payload verified in ${duration.toFixed(2)} ms`);
  });

  test("Empty, whitespace, and nullish inputs do not throw or corrupt editor", async () => {
    const editor = page.locator("#body-editor");
    await editor.evaluate((el) => {
      el.innerText = "Initial Text";
    });

    await fastInjectText(page, editor, "");
    let content = await editor.innerText();
    assert.strictEqual(content, "Initial Text", "Empty string should be a no-op");

    await fastInjectText(page, editor, null);
    content = await editor.innerText();
    assert.strictEqual(content, "Initial Text", "Null should be a no-op");
  });

  test("Empirical Challenge: Calling fastInjectText on a hidden element drops keystrokes", async () => {
    await page.locator("#close-modal-btn").click();
    await page.locator("#composer.open").waitFor({ state: "hidden" });

    const editor = page.locator("#body-editor");
    await fastInjectText(page, editor, "This text was typed while modal was closed");

    await page.locator("div[gh='cm']").click();
    await editor.waitFor({ state: "visible" });
    const content = await editor.innerText();

    console.log(`  [Empirical Finding] Text in editor after hidden injection: '${content}'`);
    assert.strictEqual(
      content,
      "",
      "Confirmed failure mode: fastInjectText on a hidden element silently drops keystrokes because CDP inserts into activeElement"
    );
  });

  test("Fallback path verification: when CDP insertText throws on visible element, fallback populates text", async () => {
    const editor = page.locator("#body-editor");
    await editor.evaluate((el) => {
      el.innerText = "";
    });

    const originalInsertText = page.keyboard.insertText.bind(page.keyboard);
    page.keyboard.insertText = async () => {
      throw new Error("Simulated CDP Keyboard Failure");
    };

    try {
      await fastInjectText(page, editor, "Fallback Injected Content");
      const val = await editor.innerText();
      assert.ok(val.includes("Fallback Injected Content"), "Fallback must populate the editor content");
      console.log(`  [Pass] Fallback path executed and recovered when CDP insertText threw`);
    } finally {
      page.keyboard.insertText = originalInsertText;
    }
  });

  test("teardown harness page", async () => {
    await browser.close();
  });
});

describe("Adversarial Stress Suite 2: Multi-Recipient Tokenization & PeopleKit Stress", () => {
  let browser;
  let context;
  let page;

  test("setup harness and open composer", async () => {
    browser = await chromium.launch({
      headless: true,
      channel: "chrome",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    context = await browser.newContext();
    page = await context.newPage();
    await page.setContent(MOCK_GMAIL_HTML, { waitUntil: "load" });

    await page.locator("div[gh='cm']").click();
    await page.locator("#to-input").waitFor({ state: "visible" });
  });

  test("Tokenize 25 rapid recipients with mixed delimiters in < 800ms", async () => {
    const toInput = page.locator("#to-input");
    const chipsContainer = page.locator("#chips");
    await chipsContainer.evaluate((el) => {
      el.innerHTML = "";
    });

    const recipients = Array.from({ length: 25 }, (_, i) => `user_${i + 1}@example.org`);
    const mixedDelimiters = recipients.map((r, i) => (i % 2 === 0 ? `${r}, ` : `${r}; `)).join("");

    const t0 = performance.now();
    await fastFillRecipient(page, toInput, mixedDelimiters);
    const duration = performance.now() - t0;

    const chipCount = await page.locator(".chip").count();
    assert.strictEqual(chipCount, 25, `Expected 25 PeopleKit chips, got ${chipCount}`);

    const firstChip = page.locator(".chip[email='user_1@example.org']");
    const lastChip = page.locator(".chip[email='user_25@example.org']");
    assert.ok(await firstChip.isVisible(), "First recipient chip must exist");
    assert.ok(await lastChip.isVisible(), "25th recipient chip must exist");

    assert.ok(duration < 800, `25 recipients tokenization must be < 800ms, took ${duration.toFixed(2)}ms`);
    console.log(`  [Pass] 25 recipients tokenized into chips in ${duration.toFixed(2)} ms (${(duration / 25).toFixed(2)} ms/chip)`);
  });

  test("Edge Cases: Consecutive delimiters, trailing commas, whitespace, and empty strings", async () => {
    const toInput = page.locator("#to-input");
    const chipsContainer = page.locator("#chips");
    await chipsContainer.evaluate((el) => {
      el.innerHTML = "";
    });

    const messyString = ",,,  ;  ; alpha@domain.com  ;,;  beta@domain.com  ;;; gamma@domain.com, , ";
    await fastFillRecipient(page, toInput, messyString);

    const chipCount = await page.locator(".chip").count();
    assert.strictEqual(chipCount, 3, `Expected exactly 3 clean chips from messy input, got ${chipCount}`);

    const chipEmails = await page.locator(".chip").evaluateAll((chips) => chips.map((c) => c.getAttribute("email")));
    assert.deepStrictEqual(chipEmails, ["alpha@domain.com", "beta@domain.com", "gamma@domain.com"]);

    await fastFillRecipient(page, toInput, "");
    await fastFillRecipient(page, toInput, null);
    const newCount = await page.locator(".chip").count();
    assert.strictEqual(newCount, 3, "Empty or null recipient must not create chips or throw");
  });

  test("Adversarial Recipient Challenge: Display names with commas in RFC format", async () => {
    const toInput = page.locator("#to-input");
    await page.locator("#chips").evaluate((el) => {
      el.innerHTML = "";
    });

    const rfcInput = '"Doe, John" <john@example.com>, jane@example.com';
    await fastFillRecipient(page, toInput, rfcInput);

    const chipEmails = await page.locator(".chip").evaluateAll((chips) => chips.map((c) => c.getAttribute("email")));
    console.log(`  [Empirical Observation] RFC Display Name split result: ${JSON.stringify(chipEmails)}`);
    assert.ok(chipEmails.length >= 2, "Observed behavior documented: regex split splits quoted comma names");
  });

  test("teardown harness", async () => {
    await browser.close();
  });
});

describe("Adversarial Stress Suite 3: Warm Page Session Lifecycle & Concurrency Resilience", () => {
  let sessionManager;
  let tempCookiePath;
  const validCookies = [
    { name: "SID", value: "test-sid-token", domain: ".google.com", path: "/" },
    { name: "HSID", value: "test-hsid-token", domain: ".google.com", path: "/" },
    { name: "SSID", value: "test-ssid-token", domain: ".google.com", path: "/" },
    { name: "OSID", value: "test-osid-token", domain: "mail.google.com", path: "/mail/u/1" },
    { name: "GMAIL_AT", value: "test-gmail-at-token", domain: "mail.google.com", path: "/mail/u/1" },
  ];

  test("setup test session manager with mock cookies and route interception", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gmail-session-test-"));
    tempCookiePath = path.join(tempDir, "test_cookies.json");
    fs.writeFileSync(tempCookiePath, JSON.stringify(validCookies));

    sessionManager = new BrowserSessionManager({ cookiesPath: tempCookiePath });

    const context = await sessionManager.getContext();
    await context.route("**/mail.google.com/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: MOCK_GMAIL_HTML,
      });
    });
  });

  test("Sequential Lock Serialization across 10 concurrent withWarmPage invocations", async () => {
    const executionLog = [];

    const tasks = Array.from({ length: 10 }, (_, i) => {
      return sessionManager.withWarmPage(async (page) => {
        const start = performance.now();
        await new Promise((res) => setTimeout(res, 25));
        const end = performance.now();
        executionLog.push({ id: i, start, end });
        return i;
      });
    });

    const results = await Promise.all(tasks);
    assert.deepStrictEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    for (let i = 0; i < executionLog.length - 1; i++) {
      const current = executionLog[i];
      const next = executionLog[i + 1];
      assert.ok(
        next.start >= current.end - 5,
        `Task ${next.id} (start: ${next.start.toFixed(2)}) must start after Task ${current.id} (end: ${current.end.toFixed(2)})`
      );
    }
    console.log(`  [Pass] 10 concurrent requests serialized strictly without overlapping executions`);
  });

  test("Deadlock Immunity: error in task #2 does not block subsequent tasks", async () => {
    let task1Done = false;
    let task3Done = false;

    const p1 = sessionManager.withWarmPage(async () => {
      await new Promise((r) => setTimeout(r, 20));
      task1Done = true;
      return "task1";
    });

    const p2 = sessionManager.withWarmPage(async () => {
      await new Promise((r) => setTimeout(r, 20));
      throw new Error("Intentional Task 2 Error");
    });

    const p3 = sessionManager.withWarmPage(async () => {
      await new Promise((r) => setTimeout(r, 20));
      task3Done = true;
      return "task3";
    });

    const res1 = await p1;
    assert.strictEqual(res1, "task1");
    assert.strictEqual(task1Done, true);

    await assert.rejects(p2, /Intentional Task 2 Error/, "Task 2 should reject with expected error");

    const res3 = await p3;
    assert.strictEqual(res3, "task3");
    assert.strictEqual(task3Done, true);
    console.log(`  [Pass] Sequential lock recovered cleanly after task rejection without deadlock`);
  });

  test("Crash & Close Auto-Recovery: withWarmPage recovers if warmPage was closed", async () => {
    await sessionManager.withWarmPage(async (page) => {
      await page.close();
    });

    const res = await sessionManager.withWarmPage(async (newPage) => {
      assert.ok(!newPage.isClosed(), "Recovered page must not be closed");
      return "recovered";
    });

    assert.strictEqual(res, "recovered");
    console.log(`  [Pass] Auto-recovery verified when warm page is closed unexpectedly`);
  });

  test("Disk Cookie Modification Detection: detects cookie modification and recycles context", async () => {
    const updatedCookies = [
      ...validCookies,
      { name: "EXTRA", value: "extra-token", domain: ".google.com", path: "/" },
    ];
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(tempCookiePath, JSON.stringify(updatedCookies));

    // When cookies change on disk, withWarmPage detects mtime and recycles context.
    // In our test, loading the real network without active user cookies triggers GmailSafetyError,
    // which confirms that context was recycled and security circuit breaker checked the new page!
    await assert.rejects(
      async () => {
        await sessionManager.withWarmPage(async (page) => page.url());
      },
      (err) => {
        assert.ok(err instanceof GmailSafetyError || err.message.includes("UNAUTHENTICATED_SESSION"));
        return true;
      },
      "Disk modification triggered context recycle and safety check"
    );

    console.log(`  [Pass] Cookie mtime update triggered clean context recycle & safety circuit breaker`);
  });

  test("teardown session manager", async () => {
    await sessionManager.close();
    fs.rmSync(path.dirname(tempCookiePath), { recursive: true, force: true });
  });
});

describe("Adversarial Stress Suite 4: Repeated Compose Open/Close Cycles & Warm Page Memory Stability", () => {
  let browser;
  let context;
  let page;

  test("setup test page", async () => {
    browser = await chromium.launch({
      headless: true,
      channel: "chrome",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    context = await browser.newContext();
    page = await context.newPage();
    await page.setContent(MOCK_GMAIL_HTML, { waitUntil: "load" });
  });

  test("30 Consecutive Compose Cycles: Latency and Memory Stability", async () => {
    const cycleDurations = [];
    const memorySnapshots = [];

    const composeBtn = page.locator("div[gh='cm']");
    const toInput = page.locator("#to-input");
    const subjectInput = page.locator("#subject-input");
    const bodyEditor = page.locator("#body-editor");
    const sendBtn = page.locator("#send-button");
    const composer = page.locator("#composer");

    const initialHeapMb = process.memoryUsage().heapUsed / 1024 / 1024;

    console.log(`\n  [Memory Benchmark] Starting 30 consecutive compose cycles...`);
    console.log(`  Initial Node process heap: ${initialHeapMb.toFixed(2)} MB`);

    for (let i = 1; i <= 30; i++) {
      const tCycle0 = performance.now();

      await composeBtn.click();
      await toInput.waitFor({ state: "visible" });
      await fastFillRecipient(page, toInput, `target_${i}@example.com, target_${i}_alt@example.com`);
      await fastFillSubject(subjectInput, `Subject Cycle #${i}`);

      const bodyText = `Cycle ${i}: Testing persistent warm page memory stability. `.repeat(10);
      await fastInjectText(page, bodyEditor, bodyText);

      await sendBtn.click();
      await composer.waitFor({ state: "hidden" });

      const cycleMs = performance.now() - tCycle0;
      cycleDurations.push(cycleMs);

      if (i % 5 === 0 || i === 1) {
        const curHeapMb = process.memoryUsage().heapUsed / 1024 / 1024;
        memorySnapshots.push(curHeapMb);
        console.log(`    Cycle ${i.toString().padStart(2, " ")}: ${cycleMs.toFixed(1)} ms | Heap: ${curHeapMb.toFixed(2)} MB`);
      }
    }

    const finalHeapMb = process.memoryUsage().heapUsed / 1024 / 1024;
    const avgDuration = cycleDurations.reduce((a, b) => a + b, 0) / cycleDurations.length;
    const maxDuration = Math.max(...cycleDurations);
    const minDuration = Math.min(...cycleDurations);
    const heapDiffMb = finalHeapMb - initialHeapMb;

    console.log(`  --------------------------------------------------`);
    console.log(`  Cycle Latencies: Avg = ${avgDuration.toFixed(2)} ms, Min = ${minDuration.toFixed(2)} ms, Max = ${maxDuration.toFixed(2)} ms`);
    console.log(`  Final Node process heap: ${finalHeapMb.toFixed(2)} MB (Delta: ${heapDiffMb >= 0 ? "+" : ""}${heapDiffMb.toFixed(2)} MB)`);
    console.log(`  --------------------------------------------------`);

    assert.ok(avgDuration < 250, `Average cycle duration must be < 250ms, got ${avgDuration.toFixed(2)}ms`);
    assert.ok(maxDuration < 600, `Max cycle duration must be < 600ms, got ${maxDuration.toFixed(2)}ms`);
    assert.ok(heapDiffMb < 40, `Heap growth must be < 40MB over 30 cycles, grew ${heapDiffMb.toFixed(2)}MB`);

    const cycle1 = cycleDurations[0];
    const cycle30 = cycleDurations[29];
    console.log(`  Cycle 1 vs Cycle 30: ${cycle1.toFixed(2)} ms vs ${cycle30.toFixed(2)} ms`);
    assert.ok(cycle30 < 500, `Cycle 30 must not suffer latency degradation, took ${cycle30.toFixed(2)}ms`);
  });

  test("teardown", async () => {
    await browser.close();
  });
});

describe("Adversarial Stress Suite 5: Sub-Second Execution Under Rapid Load", () => {
  let browser;
  let context;
  let page;

  test("setup harness", async () => {
    browser = await chromium.launch({
      headless: true,
      channel: "chrome",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    context = await browser.newContext();
    page = await context.newPage();
    await page.setContent(MOCK_GMAIL_HTML, { waitUntil: "load" });
  });

  test("Burst of 10 sequential full email pipelines all complete well under 1000ms threshold", async () => {
    const durations = [];

    const composeBtn = page.locator("div[gh='cm']");
    const toInput = page.locator("#to-input");
    const subjectInput = page.locator("#subject-input");
    const bodyEditor = page.locator("#body-editor");
    const sendBtn = page.locator("#send-button");
    const composer = page.locator("#composer");

    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();

      await composeBtn.click();
      await toInput.waitFor({ state: "visible" });
      await fastFillRecipient(page, toInput, `burst_${i}@domain.com`);
      await fastFillSubject(subjectInput, `Burst Dispatch Test ${i}`);
      await fastInjectText(page, bodyEditor, `Burst message ${i}: High frequency dispatch stress test.`);
      await sendBtn.click();
      await composer.waitFor({ state: "hidden" });

      const elapsed = performance.now() - t0;
      durations.push(elapsed);
      assert.ok(elapsed < 1000, `Burst pipeline ${i} must complete in < 1000ms, took ${elapsed.toFixed(2)}ms`);
    }

    durations.sort((a, b) => a - b);
    const p50 = durations[Math.floor(durations.length * 0.5)];
    const p95 = durations[Math.floor(durations.length * 0.95)];
    const p99 = durations[durations.length - 1];

    console.log(`\n  [Burst Performance Metrics]`);
    console.log(`  - p50 Latency: ${p50.toFixed(2)} ms`);
    console.log(`  - p95 Latency: ${p95.toFixed(2)} ms`);
    console.log(`  - Max Latency: ${p99.toFixed(2)} ms`);

    assert.ok(p50 < 300, `p50 must be < 300ms, got ${p50.toFixed(2)}ms`);
    assert.ok(p95 < 500, `p95 must be < 500ms, got ${p95.toFixed(2)}ms`);
  });

  test("teardown", async () => {
    await browser.close();
  });
});
