import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildResponsiveEmailHtml } from "../dist/utils/templates.js";

describe("Responsive HTML Template Builder Test Suite", () => {
  test("generates valid HTML document structure", () => {
    const html = buildResponsiveEmailHtml("Hello World", { title: "Test Email" });
    assert.strictEqual(html.includes("<!DOCTYPE html>"), true);
    assert.strictEqual(html.includes("<title>Test Email</title>"), true);
    assert.strictEqual(html.includes("Hello World"), true);
  });

  test("renders bulleted lists correctly", () => {
    const markdown = "• Item One\n• Item Two\n• Item Three";
    const html = buildResponsiveEmailHtml(markdown);
    assert.strictEqual(html.includes("<ul"), true);
    assert.strictEqual(html.includes("<li"), true);
    assert.strictEqual(html.includes("Item One"), true);
    assert.strictEqual(html.includes("Item Two"), true);
  });

  test("renders blockquotes with custom brand colors", () => {
    const body = "> This is an important quote.";
    const html = buildResponsiveEmailHtml(body, { brandColor: "#e63946" });
    assert.strictEqual(html.includes("<blockquote"), true);
    assert.strictEqual(html.includes("#e63946"), true);
    assert.strictEqual(html.includes("This is an important quote."), true);
  });

  test("escapes HTML entities to prevent unescaped injections", () => {
    const body = "Caution: 5 < 10 & 20 > 15; \"quotes\" and 'single'";
    const html = buildResponsiveEmailHtml(body);
    assert.strictEqual(html.includes("&lt;"), true);
    assert.strictEqual(html.includes("&amp;"), true);
    assert.strictEqual(html.includes("&quot;"), true);
  });
});
