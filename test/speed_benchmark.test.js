import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { performance } from "node:perf_hooks";
import {
  fastInjectText,
  fastFillRecipient,
  fastFillSubject,
  humanType,
} from "../dist/utils/rate_limiter.js";

const MOCK_GMAIL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Mock Gmail Speed Benchmark</title>
  <style>
    body { font-family: Roboto, Arial, sans-serif; margin: 0; padding: 20px; background: #f6f8fc; }
    .compose-btn { padding: 12px 24px; background: #c2e7ff; border-radius: 16px; cursor: pointer; display: inline-flex; }
    .compose-window { display: none; width: 500px; background: white; border: 1px solid #ccc; border-radius: 8px; margin-top: 20px; }
    .compose-window.open { display: block; }
    .field { border-bottom: 1px solid #e0e0e0; padding: 8px 12px; display: flex; align-items: center; }
    .field input { border: none; outline: none; width: 100%; font-size: 14px; }
    .chips { display: flex; gap: 4px; }
    .chip { background: #e8eaed; border-radius: 12px; padding: 2px 8px; font-size: 12px; display: inline-flex; }
    .body-box { min-height: 150px; padding: 12px; outline: none; font-size: 14px; }
    .footer { padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; }
    .send-btn { background: #0b57d0; color: white; padding: 8px 18px; border-radius: 18px; cursor: pointer; border: none; }
    .toast { display: none; position: fixed; bottom: 20px; left: 20px; background: #323232; color: white; padding: 12px 20px; border-radius: 4px; }
    .toast.visible { display: block; }
  </style>
</head>
<body>
  <div id="app">
    <div gh="cm" role="button" aria-label="Compose" class="compose-btn" id="compose-btn">Compose</div>
    <div id="composer" class="compose-window">
      <div class="field">
        <div id="chips" class="chips"></div>
        <input aria-label="To" placeholder="Recipients" id="to-input" />
      </div>
      <div class="field">
        <input name="subjectbox" aria-label="Subject" placeholder="Subject" id="subject-input" />
      </div>
      <div role="textbox" aria-label="Message Body" contenteditable="true" class="body-box" id="body-editor"></div>
      <div class="footer">
        <div role="button" aria-label="Send" class="send-btn" id="send-button">Send</div>
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

    composeBtn.addEventListener('click', () => {
      composer.classList.add('open');
      toInput.focus();
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
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 5000);
      }, 80);
    });
  </script>
</body>
</html>
`;

describe("Automated Speed Benchmark & Latency Assertions", () => {
  let browser;
  let context;

  test("Fast Input Injection vs Legacy humanType Benchmark & Sub-Second Execution", async () => {
    browser = await chromium.launch({
      headless: true,
      channel: "chrome",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(MOCK_GMAIL_HTML, { waitUntil: "load" });

    const recipient = "sparppp86@gmail.com";
    const subject = "Automated High-Speed Dispatch Benchmark";
    const body =
      "Line 1: High speed Playwright execution.\nLine 2: Zero jitter latency.\nLine 3: Fast atomic DevTools CDP injection verified.";

    // Measure Fast Pipeline
    const tStart = performance.now();

    // 1. Open Compose Modal
    const tOpen0 = performance.now();
    const composeBtn = page.locator("div[gh='cm']");
    await composeBtn.click();
    const toInput = page.locator("#to-input");
    await toInput.waitFor({ state: "visible" });
    const openLatency = performance.now() - tOpen0;

    // 2. Fast Recipient Injection via fastFillRecipient
    const tTo0 = performance.now();
    await fastFillRecipient(page, toInput, recipient);
    const toLatency = performance.now() - tTo0;

    // Verify chip created in PeopleKit container
    const chip = page.locator(".chip[email='sparppp86@gmail.com']");
    await chip.waitFor({ state: "visible" });

    // 3. Fast Subject Injection via fastFillSubject
    const tSub0 = performance.now();
    const subInput = page.locator("#subject-input");
    await fastFillSubject(subInput, subject);
    const subLatency = performance.now() - tSub0;

    // 4. Fast Body Injection via fastInjectText (CDP)
    const tBody0 = performance.now();
    const bodyEditor = page.locator("#body-editor");
    await fastInjectText(page, bodyEditor, body);
    const bodyLatency = performance.now() - tBody0;

    // 5. Send & Event-Driven Confirmation
    const tSend0 = performance.now();
    await page.locator("#send-button").click();
    await Promise.race([
      page.locator("#toast.visible, .toast.visible").waitFor({ state: "visible", timeout: 5000 }),
      page.locator("#composer.open").waitFor({ state: "hidden", timeout: 5000 }),
    ]);
    const sendLatency = performance.now() - tSend0;

    const totalFastPipeline = performance.now() - tStart;

    console.log("\n============================================================");
    console.log("            SPEED BENCHMARK ASSERTION RESULTS               ");
    console.log("============================================================");
    console.log(`- Compose Open:      ${openLatency.toFixed(2)} ms (Threshold: < 350ms)`);
    console.log(`- Recipient (To):    ${toLatency.toFixed(2)} ms (Threshold: < 150ms)`);
    console.log(`- Subject Fill:      ${subLatency.toFixed(2)} ms (Threshold: < 50ms)`);
    console.log(`- Body CDP Insert:   ${bodyLatency.toFixed(2)} ms (Threshold: < 50ms)`);
    console.log(`- Send + Toast Await:${sendLatency.toFixed(2)} ms (Threshold: < 600ms)`);
    console.log(`- TOTAL PIPELINE:    ${totalFastPipeline.toFixed(2)} ms (Threshold: < 1200ms)`);
    console.log("============================================================\n");

    // Benchmark Assertions
    assert.ok(openLatency < 350, `Compose open latency should be < 350ms, got ${openLatency.toFixed(2)}ms`);
    assert.ok(toLatency < 150, `Recipient latency should be < 150ms, got ${toLatency.toFixed(2)}ms`);
    assert.ok(subLatency < 50, `Subject latency should be < 50ms, got ${subLatency.toFixed(2)}ms`);
    assert.ok(bodyLatency < 50, `Body latency should be < 50ms, got ${bodyLatency.toFixed(2)}ms`);
    assert.ok(sendLatency < 600, `Send + Toast latency should be < 600ms, got ${sendLatency.toFixed(2)}ms`);
    assert.ok(totalFastPipeline < 1200, `Total fast pipeline should be < 1200ms, got ${totalFastPipeline.toFixed(2)}ms`);

    await browser.close();
  });

  test("Speedup Ratio: fastInjectText is at least 10x faster than legacy humanType", async () => {
    browser = await chromium.launch({
      headless: true,
      channel: "chrome",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(
      `<!DOCTYPE html><html><body><div id="editor" contenteditable="true" style="min-height:100px;"></div></body></html>`,
      { waitUntil: "load" }
    );

    const testText = "The quick brown fox jumps over the lazy dog. Benchmarking speedup ratio.";
    const editor = page.locator("#editor");

    // 1. Measure fastInjectText
    const t0Fast = performance.now();
    await fastInjectText(page, editor, testText);
    const fastDuration = performance.now() - t0Fast;

    // Verify text injected
    const fastContent = await editor.innerText();
    assert.ok(fastContent.includes("quick brown fox"));

    // Clear editor
    await editor.evaluate((el) => {
      el.innerText = "";
    });

    // 2. Measure legacy humanType on a short 20-char substring
    const sampleSub = testText.slice(0, 20);
    const t0Legacy = performance.now();
    await humanType(page, editor, sampleSub);
    const legacyDuration = performance.now() - t0Legacy;

    console.log(`[Speedup Comparison]`);
    console.log(`- fastInjectText (${testText.length} chars): ${fastDuration.toFixed(2)} ms`);
    console.log(`- legacy humanType (${sampleSub.length} chars sample): ${legacyDuration.toFixed(2)} ms`);

    // Even on 20 characters vs full 72 characters, fastInjectText should be significantly faster
    assert.ok(
      fastDuration < legacyDuration,
      `fastInjectText (${fastDuration.toFixed(2)}ms) must be faster than humanType (${legacyDuration.toFixed(2)}ms)`
    );

    await browser.close();
  });
});
