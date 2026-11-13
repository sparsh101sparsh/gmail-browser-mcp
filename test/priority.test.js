import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyEmailPriority, triageEmailList } from "../dist/services/priority.js";

describe("Smart Email Priority & Triage Test Suite", () => {
  test("identifies critical security alerts", () => {
    const email = {
      sender: "Google",
      subject: "Security alert: New sign-in detected",
      snippet: "We noticed a new login on your device.",
      is_unread: true,
    };
    const triage = classifyEmailPriority(email);
    assert.strictEqual(triage.priority, "CRITICAL");
    assert.strictEqual(triage.score, 5);
    assert.strictEqual(triage.category, "Security");
  });

  test("identifies high priority invoices and billing emails", () => {
    const email = {
      sender: "Billing Dept",
      subject: "Your Monthly Invoice #1029",
      snippet: "Payment received for subscription.",
      is_unread: true,
    };
    const triage = classifyEmailPriority(email);
    assert.strictEqual(triage.priority, "HIGH");
    assert.strictEqual(triage.score, 4);
    assert.strictEqual(triage.category, "Billing");
  });

  test("identifies urgent action items", () => {
    const email = {
      sender: "Manager",
      subject: "URGENT: Client deliverable due today",
      snippet: "Please send the report ASAP.",
      is_unread: true,
    };
    const triage = classifyEmailPriority(email);
    assert.strictEqual(triage.priority, "HIGH");
    assert.strictEqual(triage.category, "Action Required");
  });

  test("identifies low-priority marketing and newsletters", () => {
    const email = {
      sender: "Newsletter Daily",
      subject: "This week in tech: Issue 42",
      snippet: "Click here to unsubscribe from this digest.",
      is_unread: true,
    };
    const triage = classifyEmailPriority(email);
    assert.strictEqual(triage.priority, "NEWSLETTER");
    assert.strictEqual(triage.score, 1);
    assert.strictEqual(triage.category, "Marketing");
  });

  test("triages list with sorted priority", () => {
    const list = [
      { sender: "News", subject: "Unsubscribe here", snippet: "Promo", is_unread: false, has_attachments: false, date: "" },
      { sender: "Google", subject: "Security alert", snippet: "Alert", is_unread: true, has_attachments: false, date: "" },
    ];
    const triaged = triageEmailList(list);
    assert.strictEqual(triaged[0].triage.priority, "NEWSLETTER");
    assert.strictEqual(triaged[1].triage.priority, "CRITICAL");
  });
});
