import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { compileSearchQuery } from "../dist/utils/security.js";

describe("Extended Search Filters Test Suite", () => {
  test("compiles is_starred filter", () => {
    const q = compileSearchQuery({ is_starred: true });
    assert.strictEqual(q, "is:starred");
  });

  test("compiles larger_than and smaller_than filters", () => {
    const q = compileSearchQuery({ larger_than: "10M", smaller_than: "25M" });
    assert.strictEqual(q, "larger:10M smaller:25M");
  });

  test("compiles filename filter", () => {
    const q = compileSearchQuery({ filename: "invoice.pdf" });
    assert.strictEqual(q, "filename:invoice.pdf");
  });

  test("compiles in_folder filter", () => {
    const q = compileSearchQuery({ in_folder: "trash" });
    assert.strictEqual(q, "in:trash");
  });

  test("combines complex filters harmoniously", () => {
    const q = compileSearchQuery({
      from: "finance@company.com",
      has_attachments: true,
      filename: "pdf",
      larger_than: "1M",
      is_starred: true,
    });
    assert.strictEqual(
      q,
      "from:finance@company.com has:attachment is:starred larger:1M filename:pdf"
    );
  });
});
