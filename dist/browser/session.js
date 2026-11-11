import { chromium } from "playwright";
import fs from "node:fs";
import { loadCookies, expandHome, getDefaultCookiePath } from "../utils/cookies.js";
import { checkPageSafety } from "./guardrails.js";
export class BrowserSessionManager {
    browser = null;
    context = null;
    warmPage = null;
    isInitializing = false;
    warmupPromise = null;
    lockPromise = Promise.resolve();
    cookiesPath;
    cookieMtime = 0;
    accountIndex = 1;
    constructor(options) {
        this.cookiesPath = options?.cookiesPath;
    }
    getAccountIndex() {
        return this.accountIndex;
    }
    async getContext() {
        if (this.context && this.browser && this.browser.isConnected()) {
            return this.context;
        }
        if (this.browser && !this.browser.isConnected()) {
            await this.close();
        }
        if (this.isInitializing) {
            while (this.isInitializing) {
                await new Promise((res) => setTimeout(res, 50));
            }
            if (this.context && this.browser && this.browser.isConnected())
                return this.context;
        }
        this.isInitializing = true;
        try {
            const headless = process.env.GMAIL_HEADLESS !== "false";
            try {
                this.browser = await chromium.launch({
                    headless,
                    channel: "chrome",
                    args: [
                        "--disable-blink-features=AutomationControlled",
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-infobars",
                        "--disable-dev-shm-usage",
                        "--window-size=1280,800",
                    ],
                });
            }
            catch (err) {
                console.error(`[browser] Could not launch Chrome channel (${err.message}). Falling back to bundled Chromium.`);
                this.browser = await chromium.launch({
                    headless,
                    args: [
                        "--disable-blink-features=AutomationControlled",
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-infobars",
                        "--disable-dev-shm-usage",
                        "--window-size=1280,800",
                    ],
                });
            }
            this.browser.on("disconnected", () => {
                console.error("[browser] Browser process disconnected. Invalidating session.");
                this.warmPage = null;
                this.context = null;
                this.browser = null;
            });
            this.context = await this.browser.newContext({
                userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
                viewport: { width: 1280, height: 800 },
                deviceScaleFactor: 1,
                locale: "en-US",
            });
            // Remove navigator.webdriver
            await this.context.addInitScript(() => {
                Object.defineProperty(navigator, "webdriver", {
                    get: () => undefined,
                });
            });
            // Load and inject cookies
            const targetCookiePath = expandHome(this.cookiesPath || getDefaultCookiePath());
            if (fs.existsSync(targetCookiePath)) {
                this.cookieMtime = fs.statSync(targetCookiePath).mtimeMs;
            }
            const { cookies, accountIndex } = loadCookies(this.cookiesPath);
            this.accountIndex = accountIndex;
            await this.context.addCookies(cookies);
            console.error(`[browser] Injected ${cookies.length} session cookies into browser context (Account index: ${this.accountIndex}).`);
            return this.context;
        }
        catch (err) {
            await this.close();
            throw err;
        }
        finally {
            this.isInitializing = false;
        }
    }
    async warmup(accountIndex) {
        if (this.warmupPromise) {
            return this.warmupPromise;
        }
        if (this.warmPage &&
            !this.warmPage.isClosed() &&
            this.browser &&
            this.browser.isConnected()) {
            return;
        }
        this.warmupPromise = (async () => {
            try {
                console.error("[browser] Initiating eager browser pre-warming...");
                const context = await this.getContext();
                const acc = accountIndex ?? this.accountIndex;
                if (!this.warmPage || this.warmPage.isClosed()) {
                    this.warmPage = await context.newPage();
                    this.warmPage.on("crash", () => {
                        console.error("[browser] Warm primary page crashed. Invalidating page.");
                        this.warmPage = null;
                    });
                    const inboxUrl = `https://mail.google.com/mail/u/${acc}/#inbox`;
                    console.error(`[browser] Pre-warming primary inbox page: ${inboxUrl}...`);
                    await this.warmPage.goto(inboxUrl, {
                        waitUntil: "domcontentloaded",
                        timeout: 30000,
                    });
                    await checkPageSafety(this.warmPage);
                    // Wait for inbox hydration indicator
                    await this.warmPage
                        .locator("div[gh='cm'], div[role='main']")
                        .first()
                        .waitFor({ state: "visible", timeout: 25000 })
                        .catch(() => { });
                    console.error("[browser] Persistent browser session pre-warmed successfully.");
                }
            }
            catch (err) {
                console.error(`[browser] Session pre-warming note: ${err.message || String(err)}`);
            }
            finally {
                this.warmupPromise = null;
            }
        })();
        return this.warmupPromise;
    }
    async withWarmPage(fn, accountIndex) {
        // Acquire sequential lock
        let releaseLock = () => { };
        const previousLock = this.lockPromise;
        this.lockPromise = new Promise((resolve) => {
            releaseLock = resolve;
        });
        // Safely wait for previous lock even if it rejected
        await previousLock.catch(() => { });
        try {
            // Check if cookies changed on disk
            const targetCookiePath = expandHome(this.cookiesPath || getDefaultCookiePath());
            if (fs.existsSync(targetCookiePath) && this.cookieMtime > 0) {
                const currentMtime = fs.statSync(targetCookiePath).mtimeMs;
                if (currentMtime > this.cookieMtime) {
                    console.error("[browser] Cookie file modified on disk. Recycling browser context.");
                    await this.close();
                }
            }
            // If warmup is in progress, wait for it
            if (this.warmupPromise) {
                await this.warmupPromise.catch(() => { });
            }
            const acc = accountIndex ?? this.accountIndex;
            // Check if warmPage exists and is open
            if (!this.warmPage || this.warmPage.isClosed() || !this.browser || !this.browser.isConnected()) {
                const context = await this.getContext();
                this.warmPage = await context.newPage();
                this.warmPage.on("crash", () => {
                    console.error("[browser] Warm primary page crashed. Invalidating page.");
                    this.warmPage = null;
                });
                const inboxUrl = `https://mail.google.com/mail/u/${acc}/#inbox`;
                console.error(`[browser] Loading primary inbox on warm page: ${inboxUrl}...`);
                await this.warmPage.goto(inboxUrl, {
                    waitUntil: "domcontentloaded",
                    timeout: 30000,
                });
                await checkPageSafety(this.warmPage);
            }
            else {
                // Ensure warm page is on the correct account if accountIndex specified
                const currentUrl = this.warmPage.url();
                if (accountIndex !== undefined && !currentUrl.includes(`/u/${accountIndex}/`)) {
                    const inboxUrl = `https://mail.google.com/mail/u/${acc}/#inbox`;
                    console.error(`[browser] Navigating warm page to account /u/${acc}/: ${inboxUrl}...`);
                    await this.warmPage.goto(inboxUrl, {
                        waitUntil: "domcontentloaded",
                        timeout: 30000,
                    });
                }
                await checkPageSafety(this.warmPage);
            }
            return await fn(this.warmPage);
        }
        catch (err) {
            if (this.warmPage?.isClosed() || (this.browser && !this.browser.isConnected())) {
                this.warmPage = null;
            }
            throw err;
        }
        finally {
            releaseLock();
        }
    }
    async withPage(fn) {
        // Acquire sequential lock
        let releaseLock = () => { };
        const previousLock = this.lockPromise;
        this.lockPromise = new Promise((resolve) => {
            releaseLock = resolve;
        });
        // Safely wait for previous lock even if it rejected
        await previousLock.catch(() => { });
        let page = null;
        try {
            const context = await this.getContext();
            page = await context.newPage();
            return await fn(page);
        }
        finally {
            if (page) {
                await page.close().catch(() => { });
            }
            releaseLock();
        }
    }
    async close() {
        if (this.warmPage) {
            await this.warmPage.close().catch(() => { });
            this.warmPage = null;
        }
        if (this.context) {
            await this.context.close().catch(() => { });
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close().catch(() => { });
            this.browser = null;
        }
    }
}
export const defaultSessionManager = new BrowserSessionManager();
// Register cleanup listeners
process.on("beforeExit", () => {
    defaultSessionManager.close().catch(() => { });
});
process.on("SIGINT", () => {
    defaultSessionManager.close().then(() => process.exit(0)).catch(() => process.exit(0));
});
process.on("SIGTERM", () => {
    defaultSessionManager.close().then(() => process.exit(0)).catch(() => process.exit(0));
});
process.on("SIGHUP", () => {
    defaultSessionManager.close().then(() => process.exit(0)).catch(() => process.exit(0));
});
process.stdin.on("close", () => {
    defaultSessionManager.close().then(() => process.exit(0)).catch(() => process.exit(0));
});
//# sourceMappingURL=session.js.map