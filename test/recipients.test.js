import test from "node:test";
import assert from "node:assert/strict";
import { parseRecipients, extractCleanEmail } from "../dist/utils/recipients.js";

test("RFC 5322 Recipient Parser Test Suite", async (t) => {
  await t.test("parses single plain email", () => {
    const res = parseRecipients("alice@example.com");
    assert.deepEqual(res, ["alice@example.com"]);
  });

  await t.test("parses comma-separated emails", () => {
    const res = parseRecipients("alice@example.com, bob@example.com, charlie@example.com");
    assert.deepEqual(res, ["alice@example.com", "bob@example.com", "charlie@example.com"]);
  });

  await t.test("parses semicolon-separated emails", () => {
    const res = parseRecipients("alice@example.com; bob@example.com; charlie@example.com");
    assert.deepEqual(res, ["alice@example.com", "bob@example.com", "charlie@example.com"]);
  });

  await t.test("handles quoted display names containing commas without splitting", () => {
    const input = '"Doe, Jane" <jane@example.com>, "Smith, Bob" <bob@example.com>, regular@example.com';
    const res = parseRecipients(input);
    assert.deepEqual(res, [
      '"Doe, Jane" <jane@example.com>',
      '"Smith, Bob" <bob@example.com>',
      "regular@example.com",
    ]);
  });

  await t.test("handles mixed quotes, semicolons, and angle brackets", () => {
    const input = '"Public, John Q." <john@example.com>; "Admin, Corp." <admin@corp.com>, user@domain.com';
    const res = parseRecipients(input);
    assert.deepEqual(res, [
      '"Public, John Q." <john@example.com>',
      '"Admin, Corp." <admin@corp.com>',
      "user@domain.com",
    ]);
  });

  await t.test("ignores empty segments and trailing commas", () => {
    const input = "  alice@example.com, , bob@example.com; ; ";
    const res = parseRecipients(input);
    assert.deepEqual(res, ["alice@example.com", "bob@example.com"]);
  });

  await t.test("handles empty or invalid inputs cleanly", () => {
    assert.deepEqual(parseRecipients(""), []);
    assert.deepEqual(parseRecipients("   "), []);
    assert.deepEqual(parseRecipients(undefined), []);
    assert.deepEqual(parseRecipients(null), []);
  });

  await t.test("extractCleanEmail extracts email from formatted string", () => {
    assert.equal(extractCleanEmail("John Doe <john@example.com>"), "john@example.com");
    assert.equal(extractCleanEmail('"Doe, John" <john@example.com>'), "john@example.com");
    assert.equal(extractCleanEmail("plain@example.com"), "plain@example.com");
    assert.equal(extractCleanEmail('"quoted@example.com"'), "quoted@example.com");
  });
});
