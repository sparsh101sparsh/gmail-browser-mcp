import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeHtmlEmail } from "../dist/utils/html_sanitizer.js";

describe("Outbound HTML Email Sanitizer Test Suite", () => {
  test("strips script tags and executable content", () => {
    const malicious = '<p>Hello</p><script>alert("pwned")</script><div>World</div>';
    const result = sanitizeHtmlEmail(malicious);
    assert.strictEqual(result.includes("<script"), false);
    assert.strictEqual(result.includes("alert"), false);
    assert.strictEqual(result.includes("<p>Hello</p>"), true);
    assert.strictEqual(result.includes("<div>World</div>"), true);
  });

  test("removes dangerous iframes, embeds, and objects", () => {
    const input = '<div>Report</div><iframe src="https://evil.com"></iframe><embed src="malware.swf">';
    const result = sanitizeHtmlEmail(input);
    assert.strictEqual(result.includes("<iframe"), false);
    assert.strictEqual(result.includes("<embed"), false);
    assert.strictEqual(result.includes("<div>Report</div>"), true);
  });

  test("neutralizes javascript: URIs in links and images", () => {
    const input = '<a href="javascript:doEvil()">Click</a><img src="javascript:bad()"/>';
    const result = sanitizeHtmlEmail(input);
    assert.strictEqual(result.includes("javascript:doEvil()"), false);
    assert.strictEqual(result.includes('href="#"'), true);
  });

  test("strips inline event handlers", () => {
    const input = '<button onclick="exploit()" onmouseover="track()" style="color:blue">Submit</button>';
    const result = sanitizeHtmlEmail(input);
    assert.strictEqual(result.includes("onclick"), false);
    assert.strictEqual(result.includes("onmouseover"), false);
    assert.strictEqual(result.includes("style=\"color:blue\""), true);
  });

  test("handles empty and malformed inputs gracefully", () => {
    assert.strictEqual(sanitizeHtmlEmail(""), "");
    assert.strictEqual(sanitizeHtmlEmail(null), "");
    assert.strictEqual(sanitizeHtmlEmail(undefined), "");
  });
});
