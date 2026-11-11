import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkPageSafety, GmailSafetyError } from "../dist/browser/guardrails.js";

describe("Guardrails Security Challenges", () => {
  test("detects unauthenticated signin redirect URL", async () => {
    const mockPage1 = {
      url: () => "https://accounts.google.com/v3/signin/identifier?continue=https://mail.google.com",
      evaluate: async () => "",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkPageSafety(mockPage1),
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "UNAUTHENTICATED_SESSION");
        return true;
      }
    );

    const mockPage2 = {
      url: () => "https://accounts.google.com/ServiceLogin?service=mail",
      evaluate: async () => "",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkPageSafety(mockPage2),
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "UNAUTHENTICATED_SESSION");
        return true;
      }
    );
  });

  test("detects security challenge / 2FA checkpoint URL", async () => {
    const mockPage = {
      url: () => "https://accounts.google.com/signin/v2/challenge/pwd",
      evaluate: async () => "",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkPageSafety(mockPage),
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "SECURITY_CHALLENGE");
        return true;
      }
    );
  });

  test("detects automation rejection URL and page text", async () => {
    const mockPageUrl = {
      url: () => "https://accounts.google.com/rejected",
      evaluate: async () => "",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkPageSafety(mockPageUrl),
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "AUTOMATION_REJECTED");
        return true;
      }
    );

    const mockPageText = {
      url: () => "https://accounts.google.com/v3/signin",
      evaluate: async () => "This browser or app may not be secure. Try using a different browser.",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkPageSafety(mockPageText),
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "UNAUTHENTICATED_SESSION"); // URL caught first
        return true;
      }
    );

    const mockPageTextOnly = {
      url: () => "https://mail.google.com/mail/u/1/#inbox",
      evaluate: async () => "Error: This browser or app may not be secure. Learn more.",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkPageSafety(mockPageTextOnly),
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "AUTOMATION_REJECTED");
        return true;
      }
    );
  });

  test("detects account disabled page", async () => {
    const mockPage = {
      url: () => "https://accounts.google.com/AccountDisabled",
      evaluate: async () => "",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkPageSafety(mockPage),
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "ACCOUNT_DISABLED");
        return true;
      }
    );
  });

  test("detects reCAPTCHA challenge element", async () => {
    const mockPage = {
      url: () => "https://mail.google.com/mail/u/1/#inbox",
      evaluate: async () => "Checking connection...",
      $: async (selector) => {
        if (selector.includes("recaptcha")) return {};
        return null;
      },
    };

    await assert.rejects(
      async () => checkPageSafety(mockPage),
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "CAPTCHA_CHALLENGE");
        return true;
      }
    );
  });

  test("detects identity verification prompt in DOM text", async () => {
    const mockPage = {
      url: () => "https://mail.google.com/mail/u/1/#inbox",
      evaluate: async () => "Verify it's you to continue to Gmail.",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkPageSafety(mockPage),
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "SECURITY_CHALLENGE");
        return true;
      }
    );
  });

  test("passes on clean authenticated Gmail page", async () => {
    const mockPage = {
      url: () => "https://mail.google.com/mail/u/1/#inbox",
      evaluate: async () => "Gmail Inbox - Primary (5 unread)",
      $: async () => null,
    };

    await assert.doesNotReject(async () => checkPageSafety(mockPage));
  });

  test("detects google.com/sorry and /sorry/index roadblock URLs", async () => {
    const mockSorry1 = {
      url: () => "https://www.google.com/sorry/index?continue=https://mail.google.com",
      evaluate: async () => "",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkPageSafety(mockSorry1),
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "SECURITY_CHALLENGE");
        return true;
      }
    );

    const mockSorry2 = {
      url: () => "https://google.com/sorry",
      evaluate: async () => "",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkPageSafety(mockSorry2),
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "SECURITY_CHALLENGE");
        return true;
      }
    );
  });

  test("detects security and auth challenges with case-insensitive URLs", async () => {
    const mockCase1 = {
      url: () => "https://ACCOUNTS.GOOGLE.COM/SERVICELOGIN?service=mail",
      evaluate: async () => "",
      $: async () => null,
    };
    await assert.rejects(
      async () => checkPageSafety(mockCase1),
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "UNAUTHENTICATED_SESSION");
        return true;
      }
    );

    const mockCase2 = {
      url: () => "https://accounts.google.com/accountdisabled?continue=mail",
      evaluate: async () => "",
      $: async () => null,
    };
    await assert.rejects(
      async () => checkPageSafety(mockCase2),
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "ACCOUNT_DISABLED");
        return true;
      }
    );
  });

  test("detects challenge text buried deep in DOM beyond 2,000 characters (up to 20,000 characters)", async () => {
    // Generate 5,000 chars of dummy text followed by challenge text
    const padding = "A".repeat(5000);
    const deepMockPage = {
      url: () => "https://mail.google.com/mail/u/1/#inbox",
      evaluate: async () => `${padding}\nUnusual traffic from your computer network`,
      $: async () => null,
    };

    await assert.rejects(
      async () => checkPageSafety(deepMockPage),
      (err) => {
        assert.ok(err instanceof GmailSafetyError);
        assert.equal(err.code, "SECURITY_CHALLENGE");
        return true;
      }
    );
  });
});
