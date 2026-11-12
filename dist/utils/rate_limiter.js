import { parseRecipients } from "./recipients.js";
export class RateLimiter {
    lastActionTime = 0;
    minIntervalMs;
    maxSearchResults;
    recentActions = [];
    maxActionsPerMinute;
    pacingQueue = Promise.resolve();
    constructor(options) {
        this.minIntervalMs = options?.minIntervalMs ?? Number(process.env.GMAIL_PACING_MS || 2500);
        this.maxSearchResults = options?.maxSearchResults ?? 30;
        this.maxActionsPerMinute = options?.maxActionsPerMinute ?? 10;
    }
    clampSearchLimit(limit) {
        const defaultLimit = 10;
        if (limit === undefined || limit === null) {
            return defaultLimit;
        }
        const num = Number(limit);
        if (isNaN(num)) {
            return defaultLimit;
        }
        const val = Math.floor(num);
        if (val <= 0)
            return defaultLimit;
        if (val > this.maxSearchResults) {
            console.error(`[rate_limiter] Requested search limit (${val}) exceeds maximum safe limit (${this.maxSearchResults}). Clamping to ${this.maxSearchResults}.`);
            return this.maxSearchResults;
        }
        return val;
    }
    async enforcePacing(actionName) {
        // Chain through pacing queue so concurrent invocations wait sequentially
        const previous = this.pacingQueue;
        let releaseQueue = () => { };
        this.pacingQueue = new Promise((resolve) => {
            releaseQueue = resolve;
        });
        await previous.catch(() => { });
        try {
            const now = Date.now();
            // Clean up actions older than 60 seconds
            this.recentActions = this.recentActions.filter((t) => now - t < 60000);
            if (this.recentActions.length >= this.maxActionsPerMinute) {
                const oldestInWindow = this.recentActions[0];
                const waitTime = 60000 - (now - oldestInWindow) + 500;
                console.error(`[rate_limiter] High action frequency detected (${this.recentActions.length} in 60s). Pacing pause: ${Math.round(waitTime / 1000)}s for action '${actionName}'`);
                await this.sleep(waitTime);
            }
            const elapsed = Date.now() - this.lastActionTime;
            if (elapsed < this.minIntervalMs) {
                const waitMs = this.minIntervalMs - elapsed;
                console.error(`[rate_limiter] Pacing gap for ${actionName}: waiting ${waitMs}ms`);
                await this.sleep(waitMs);
            }
            this.lastActionTime = Date.now();
            this.recentActions.push(this.lastActionTime);
        }
        finally {
            releaseQueue();
        }
    }
    recordActionCompleted() {
        this.lastActionTime = Date.now();
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
export async function fastInjectText(page, locator, text) {
    if (!text)
        return;
    await locator.focus();
    try {
        await page.keyboard.insertText(text);
    }
    catch {
        // Robust fallback to execCommand if CDP insertText encounters focus issue
        await locator.evaluate((el, textToInsert) => {
            el.focus();
            const success = document.execCommand("insertText", false, textToInsert);
            if (!success) {
                if ("value" in el) {
                    el.value = textToInsert;
                }
                else {
                    el.innerText = textToInsert;
                }
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }, text);
    }
}
export async function fastFillRecipient(page, locator, recipient) {
    if (!recipient)
        return;
    const list = parseRecipients(recipient);
    for (const item of list) {
        await locator.fill(item);
        await locator.press("Enter");
    }
}
export async function fastInjectHtml(page, locator, html) {
    if (!html)
        return;
    await locator.focus();
    try {
        await locator.evaluate((el, htmlContent) => {
            el.focus();
            const success = document.execCommand("insertHTML", false, htmlContent);
            if (!success) {
                el.innerHTML = htmlContent;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }, html);
    }
    catch {
        // If evaluate fails, fallback to standard text injection
        await fastInjectText(page, locator, html);
    }
}
export async function fastFillSubject(locator, subject) {
    if (!subject)
        return;
    await locator.fill(subject.trim());
}
export async function humanType(page, locator, text) {
    await locator.click();
    for (const char of text) {
        const delay = Math.floor(Math.random() * 41) + 30; // 30-70ms jitter
        await page.keyboard.type(char, { delay });
    }
}
export const defaultRateLimiter = new RateLimiter();
//# sourceMappingURL=rate_limiter.js.map