import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { validateAttachments } from "../dist/services/attachments.js";

describe("Validation and Arguments", () => {
  const docPath = path.resolve("fixtures/test_document.txt");
  const imgPath = path.resolve("fixtures/test_image.png");
  const emptyPath = path.resolve("fixtures/test_empty.txt");

  test("handles empty attachment list", () => {
    const res = validateAttachments([]);
    assert.deepEqual(res.resolvedPaths, []);
    assert.equal(res.totalSizeBytes, 0);

    const resUndef = validateAttachments(undefined);
    assert.deepEqual(resUndef.resolvedPaths, []);
    assert.equal(resUndef.totalSizeBytes, 0);
  });

  test("validates single attachment", () => {
    const res = validateAttachments([docPath]);
    assert.equal(res.resolvedPaths.length, 1);
    assert.ok(res.totalSizeBytes > 0);
  });

  test("validates multiple attachments", () => {
    const res = validateAttachments([docPath, imgPath]);
    assert.equal(res.resolvedPaths.length, 2);
    assert.ok(res.totalSizeBytes > 0);
  });

  test("rejects non-existent attachment file", () => {
    assert.throws(
      () => validateAttachments(["fixtures/does_not_exist.txt"]),
      /Attachment file does not exist/
    );
  });

  test("rejects non-regular file (directory)", () => {
    assert.throws(
      () => validateAttachments(["fixtures"]),
      /Attachment path is not a regular file/
    );
  });

  test("rejects 0-byte empty file", () => {
    assert.throws(
      () => validateAttachments([emptyPath]),
      /Attachment file is empty \(0 bytes\)/
    );
  });

  test("rejects invalid path types and empty path strings", () => {
    assert.throws(() => validateAttachments([null]), /Invalid attachment path entry/);
    assert.throws(() => validateAttachments([123]), /Invalid attachment path entry/);
    assert.throws(() => validateAttachments(["   "]), /Invalid attachment path entry/);
    assert.throws(() => validateAttachments([""]), /Invalid attachment path entry/);
  });

  test("rejects non-array attachment_paths input", () => {
    assert.throws(
      () => validateAttachments("fixtures/test_document.txt"),
      /attachment_paths must be an array/
    );
    assert.throws(
      () => validateAttachments({ path: docPath }),
      /attachment_paths must be an array/
    );
  });
});
