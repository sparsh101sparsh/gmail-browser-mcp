import type { Page } from "playwright";

export class GmailSafetyError extends Error {
  public readonly code: string;
  public readonly url: string;

  constructor(message: string, code: string, url: string) {
    super(message);
    this.name = "GmailSafetyError";
    this.code = code;
    this.url = url;
  }
}

export async function checkPageSafety(page: Page): Promise<void> {
  const currentUrl = page.url();
  const lowerUrl = currentUrl.toLowerCase();

  // 1. URL pattern checks
  if (
    lowerUrl.includes("accounts.google.com/v3/signin") ||
    lowerUrl.includes("accounts.google.com/servicelogin") ||
    lowerUrl.includes("accounts.google.com/signin/v2/identifier") ||
    lowerUrl.includes("accounts.google.com/signin/identifier")
  ) {
    throw new GmailSafetyError(
      `Unauthenticated session detected (redirected to ${currentUrl}). Your Gmail session cookies may be missing, expired, or invalid. Please re-export cookies from a logged-in Gmail session into ~/Downloads/mail.google.com_cookies.json.`,
      "UNAUTHENTICATED_SESSION",
      currentUrl
    );
  }

  if (
    lowerUrl.includes("accounts.google.com/signin/v2/challenge") ||
    lowerUrl.includes("accounts.google.com/signin/challenge") ||
    lowerUrl.includes("/challenge/") ||
    lowerUrl.includes("google.com/sorry") ||
    lowerUrl.includes("/sorry/index")
  ) {
    throw new GmailSafetyError(
      `Google security challenge / 2FA checkpoint detected at ${currentUrl}. Halting immediately per gmail-safe-use rules. Complete verification in a regular desktop browser.`,
      "SECURITY_CHALLENGE",
      currentUrl
    );
  }

  if (
    lowerUrl.includes("accounts.google.com/rejected") ||
    lowerUrl.includes("/signin/rejected")
  ) {
    throw new GmailSafetyError(
      `Google rejected browser automation connection at ${currentUrl} ('This browser or app may not be secure'). Halting immediately to safeguard account reputation.`,
      "AUTOMATION_REJECTED",
      currentUrl
    );
  }

  if (
    lowerUrl.includes("accounts.google.com/accountdisabled") ||
    lowerUrl.includes("/account/disabled")
  ) {
    throw new GmailSafetyError(
      `Google account disabled page detected at ${currentUrl}. Halting immediately per safety protocols.`,
      "ACCOUNT_DISABLED",
      currentUrl
    );
  }

  // 2. DOM / Body content checks
  try {
    const pageText = await page.evaluate(() => {
      return document.body ? document.body.innerText.substring(0, 20000) : "";
    });

    if (/this browser or app may not be secure/i.test(pageText)) {
      throw new GmailSafetyError(
        `Google automation rejection detected in page text ('This browser or app may not be secure'). Halting immediately.`,
        "AUTOMATION_REJECTED",
        currentUrl
      );
    }

    if (/verify it['’]s you/i.test(pageText) || /confirm your phone/i.test(pageText)) {
      throw new GmailSafetyError(
        `Google identity verification prompt detected in page text. Halting immediately per gmail-safe-use rules.`,
        "SECURITY_CHALLENGE",
        currentUrl
      );
    }

    if (/your account has been disabled/i.test(pageText)) {
      throw new GmailSafetyError(
        `Account disabled notice detected in page text. Halting immediately.`,
        "ACCOUNT_DISABLED",
        currentUrl
      );
    }

    if (/unusual traffic from your computer network/i.test(pageText)) {
      throw new GmailSafetyError(
        `Google unusual network traffic / rate limit challenge detected. Halting operation immediately.`,
        "SECURITY_CHALLENGE",
        currentUrl
      );
    }

    // Check for reCAPTCHA iframe or container
    const hasCaptcha = await page.$(
      "iframe[src*='recaptcha'], div#recaptcha, div.g-recaptcha, iframe[title*='reCAPTCHA' i]"
    );
    if (hasCaptcha) {
      throw new GmailSafetyError(
        `reCAPTCHA challenge detected on ${currentUrl}. Automated solving is prohibited by gmail-safe-use. Complete the challenge in a regular browser.`,
        "CAPTCHA_CHALLENGE",
        currentUrl
      );
    }
  } catch (err: any) {
    if (err instanceof GmailSafetyError) {
      throw err;
    }
    // Context or evaluation error during navigation is caught safely
  }
}
