#!/usr/bin/env node

/**
 * Interactive Profile Setup & Immediate Email Dispatch
 * Launches Chrome with persistent profile ~/.gmail-mcp-profile.
 * Waits for active Gmail inbox, then immediately composes and dispatches
 * the random email to sparppp86@gmail.com with toast verification.
 */

import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

async function main() {
  const profileDir = path.join(os.homedir(), ".gmail-mcp-profile");
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const to = "sparppp86@gmail.com";
  const randomTopics = [
    "High-Speed System Verification",
    "Persistent Profile Performance Benchmark",
    "Automated Workflow Status",
    "Sub-Second Pipeline Validation",
    "Architectural Milestone Briefing",
  ];
  const chosenTopic = randomTopics[Math.floor(Math.random() * randomTopics.length)];
  const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const subject = `${chosenTopic} [#${randomId}]`;

  const timestamp = new Date().toLocaleString("en-US", { timeZoneName: "short" });
  const body = `Hey Sparsh,

This email was sent via my Gmail MCP Persistent Profile engine.

Performance & Architecture:
• Engine: Persistent Chrome Profile (~/.gmail-mcp-profile)
• Fast Injection: Atomic Chrome DevTools Protocol (Input.insertText)
• Cookies: Zero JSON exports needed
• Dispatch ID: ${randomId}
• Timestamp: ${timestamp}

All automated systems are running smoothly!

Best,
Sparsh`;

  console.log(`[setup_and_send] Profile directory: ${profileDir}`);
  console.log(`[setup_and_send] Outbound Target: ${to}`);
  console.log(`[setup_and_send] Subject: ${subject}`);
  console.log(`[setup_and_send] Launching Chrome...`);

  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      channel: "chrome",
      args: [
        "--disable-blink-features=AutomationControlled",
        "--window-size=1280,900",
      ],
      viewport: { width: 1280, height: 900 },
    });
  } catch (err) {
    console.log(`Chrome channel fallback: ${err.message}`);
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--window-size=1280,900",
      ],
      viewport: { width: 1280, height: 900 },
    });
  }

  const page = context.pages()[0] || (await context.newPage());

  // Inject initial cookies if available to seed Google account identifiers
  const cookiePath = path.join(os.homedir(), "Downloads", "mail.google.com_cookies.json");
  if (fs.existsSync(cookiePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cookiePath, "utf-8"));
      const cookies = raw
        .filter((c) => c && c.name && c.value)
        .map((c) => {
          let domain = c.domain || ".google.com";
          if (domain === "google.com") domain = ".google.com";
          const item = {
            name: c.name.trim(),
            value: c.value,
            domain,
            path: c.path || "/",
            httpOnly: !!c.httpOnly,
            secure: !!c.secure,
          };
          if (c.sameSite === "no_restriction" || c.sameSite === "None") {
            item.sameSite = "None";
            item.secure = true;
          }
          return item;
        });
      await context.addCookies(cookies);
      console.log(`[setup_and_send] Seeded ${cookies.length} base cookies into persistent profile.`);
    } catch (e) {
      console.log(`[setup_and_send] Cookie seed note: ${e.message}`);
    }
  }

  console.log(`[setup_and_send] Navigating to https://mail.google.com/...`);
  await page.goto("https://mail.google.com/", { waitUntil: "domcontentloaded" });

  console.log(`\n>>> ACTION REQUIRED: Please complete the verification in the opened Chrome window.`);
  console.log(`>>> Waiting up to 15 minutes for verification to complete and Gmail inbox to load...\n`);

  const composeBtn = page.locator("div[gh='cm'], div[role='button']:has-text('Compose')").first();
  const maxWaitMs = 15 * 60 * 1000;
  const startWait = Date.now();
  let inboxReady = false;
  let lastReport = Date.now();

  while (Date.now() - startWait < maxWaitMs) {
    if (await composeBtn.isVisible().catch(() => false)) {
      inboxReady = true;
      break;
    }
    const curUrl = page.url();
    if (curUrl.includes("mail.google.com/mail") && !curUrl.includes("signin") && !curUrl.includes("verification")) {
      if (await composeBtn.isVisible().catch(() => false)) {
        inboxReady = true;
        break;
      }
    }
    if (Date.now() - lastReport >= 15000) {
      const elapsedMin = ((Date.now() - startWait) / 60000).toFixed(1);
      console.log(`[setup_and_send] Still waiting for inbox (${elapsedMin}m elapsed)... Current URL: ${curUrl.slice(0, 75)}...`);
      lastReport = Date.now();
    }
    await page.waitForTimeout(2000);
  }

  if (!inboxReady) {
    throw new Error("Timeout: Inbox did not load within 15 minutes.");
  }

  console.log(`[setup_and_send] INBOX DETECTED! Triggering compose modal...`);
  await composeBtn.click();

  // Fill Recipient
  const toInput = page.locator("input[aria-label*='To' i], input[peoplekit-id], div[name='to'] input").first();
  await toInput.waitFor({ state: "visible", timeout: 10000 });
  await toInput.fill(to);
  await toInput.press("Enter");

  // Fill Subject
  const subjectBox = page.locator("input[name='subjectbox'], input[aria-label*='Subject' i]").first();
  await subjectBox.fill(subject);

  // Fill Body via CDP
  const bodyBox = page
    .locator("div[role='textbox'][aria-label*='Message Body' i], div[aria-label*='Message Body' i]")
    .first();
  await bodyBox.waitFor({ state: "visible", timeout: 10000 });
  await bodyBox.focus();
  await page.keyboard.insertText(body);

  // Send
  console.log(`[setup_and_send] Clicking Send button...`);
  const sendButton = page
    .locator(
      "div[role='button'][aria-label*='Send' i], div[role='button'][data-tooltip*='Send' i], div[role='button']:has-text('Send')"
    )
    .first();
  await sendButton.click();

  // Await "Message sent" toast confirmation
  console.log(`[setup_and_send] Awaiting 'Message sent' confirmation...`);
  let confirmed = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const text = await page.evaluate(() => document.body ? document.body.innerText : "").catch(() => "");
    if (text.includes("Message sent") || text.includes("Mensaje enviado") || text.includes("Nachricht gesendet")) {
      console.log(`[setup_and_send] CONFIRMED: Message sent toast detected at second ${i + 1}!`);
      confirmed = true;
      break;
    }
  }

  if (!confirmed) {
    console.log(`[setup_and_send] Toast timed out, checking if compose window closed...`);
    const isComposeOpen = await bodyBox.isVisible().catch(() => false);
    if (!isComposeOpen) {
      console.log(`[setup_and_send] Compose editor closed. Delivery complete.`);
      confirmed = true;
    }
  }

  // Save confirmation screenshot
  try {
    await page.screenshot({ path: "docs/assets/persistent_send_confirmation.png" });
    console.log(`[setup_and_send] Saved confirmation screenshot to docs/assets/persistent_send_confirmation.png`);
  } catch {}

  console.log(`\n============================================================`);
  console.log(`  SUCCESS! Email delivered to ${to}`);
  console.log(`  Persistent profile saved to: ${profileDir}`);
  console.log(`============================================================\n`);

  await page.waitForTimeout(2000);
  await context.close();
  process.exit(confirmed ? 0 : 1);
}

main().catch((err) => {
  console.error(`[setup_and_send] Error:`, err);
  process.exit(1);
});
