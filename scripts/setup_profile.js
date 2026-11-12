#!/usr/bin/env node

/**
 * Interactive Profile Setup Script
 * Launches system Chrome with the persistent profile directory (~/.gmail-mcp-profile)
 * so the user can log into their Google Account once.
 * The session is permanently saved on disk for zero-cookie headless automation.
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

  console.log(`============================================================`);
  console.log(`        GMAIL MCP PERSISTENT PROFILE SETUP                  `);
  console.log(`============================================================`);
  console.log(`Profile directory: ${profileDir}`);
  console.log(`Launching visible Google Chrome...`);

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
    console.log(`Chrome channel unavailable (${err.message}). Launching standard Chromium...`);
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
  console.log(`Navigating to https://mail.google.com/...`);
  await page.goto("https://mail.google.com/", { waitUntil: "domcontentloaded" });

  console.log(`\nPlease log in to your Gmail account in the opened window if prompted.`);
  console.log(`Waiting for active inbox detection... (timeout: 120s)\n`);

  // Poll for inbox load
  const startTime = Date.now();
  let loggedIn = false;

  while (Date.now() - startTime < 120000) {
    const currentUrl = page.url();
    const title = await page.title().catch(() => "");

    const hasCompose = await page
      .locator("div[gh='cm'], div[role='button']:has-text('Compose')")
      .first()
      .isVisible()
      .catch(() => false);

    if (hasCompose || (currentUrl.includes("mail.google.com/mail/") && !currentUrl.includes("/signin/"))) {
      console.log(`============================================================`);
      console.log(`  AUTHENTICATION SUCCESSFUL!                                `);
      console.log(`============================================================`);
      console.log(`Detected Inbox: "${title}" (${currentUrl})`);
      console.log(`Your persistent profile is permanently saved at:`);
      console.log(`  ${profileDir}\n`);
      console.log(`You can now run Gmail MCP headlessly with zero cookie exports!`);
      loggedIn = true;
      break;
    }

    await page.waitForTimeout(1000);
  }

  if (!loggedIn) {
    console.error(`Login detection timed out after 120 seconds.`);
  }

  console.log(`Closing setup browser window...`);
  await context.close();
  process.exit(loggedIn ? 0 : 1);
}

main().catch((err) => {
  console.error(`Fatal setup error:`, err);
  process.exit(1);
});
