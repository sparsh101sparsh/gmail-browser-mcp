export class GmailSafetyError extends Error {
  public code: string;
  public url: string;

  constructor(code: string, url: string, message: string) {
    super(message);
    this.name = "GmailSafetyError";
    this.code = code;
    this.url = url;
  }
}
import type { Page } from "playwright";

export async function checkPageSafety(page: Page): Promise<void> {
  const currentUrl = page.url();
  const lowerUrl = currentUrl.toLowerCase();

  if (
    lowerUrl.includes("accounts.google.com/v3/signin") ||
    lowerUrl.includes("accounts.google.com/servicelogin") ||
    lowerUrl.includes("accounts.google.com/signin/v2/identifier") ||
    lowerUrl.includes("accounts.google.com/signin/identifier")
  ) {
    throw new GmailSafetyError(
      "UNAUTHENTICATED_SESSION",
      currentUrl,
      `Unauthenticated session detected (redirected to ${currentUrl}). Your Gmail session cookies may be missing, expired, or invalid. Please re-export cookies from a logged-in Gmail session into ~/Downloads/mail.google.com_cookies.json.`
    );
  }

  if (
    lowerUrl.includes("/signin/v2/challenge") ||
    lowerUrl.includes("/signin/challenge") ||
    lowerUrl.includes("challenge/speedbump") ||
    lowerUrl.includes("challenge/verify")
  ) {
    throw new GmailSafetyError(
      "SECURITY_CHALLENGE",
      currentUrl,
      `Google 2-Step Verification or Identity Challenge detected at ${currentUrl}. Halting immediately to protect account health.`
    );
  }
}
