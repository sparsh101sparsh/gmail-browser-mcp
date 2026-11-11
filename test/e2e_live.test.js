import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultGmailService } from "../dist/services/gmail.js";

test("Live E2E Gmail Verification Test", async (t) => {
  console.log("Checking session with user cookies...");
  const session = await defaultGmailService.checkSession();
  assert.equal(session.authenticated, true, "Session must be authenticated");
  console.log("Session verified successfully:", session);

  console.log("Sending verification email to sparppp86@gmail.com...");
  const result = await defaultGmailService.sendEmail({
    to: "sparppp86@gmail.com",
    subject: "Gmail Browser MCP Verification Test",
    body: "Hello Sparsh,\n\nThis is an automated verification test sent via the Gmail Browser MCP server.\nAll stealth mechanisms, guardrails, and cookie routing are fully operational.\n\nBest regards,\nGmail Browser MCP",
  });

  console.log("Email dispatch result:", result);
  assert.equal(result.status, "success", "Email must be sent successfully");
  assert.equal(result.to, "sparppp86@gmail.com");
});
