import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { defaultGmailService } from "../dist/services/gmail.js";

describe("Batch Mailbox Operations Test Suite", () => {
  test("batchMarkAsRead rejects empty array", async () => {
    await assert.rejects(
      async () => {
        await defaultGmailService.batchMarkAsRead([]);
      },
      {
        message: /Must provide non-empty array of thread IDs for batchMarkAsRead/,
      }
    );
  });

  test("batchArchive rejects empty array", async () => {
    await assert.rejects(
      async () => {
        await defaultGmailService.batchArchive([]);
      },
      {
        message: /Must provide non-empty array of thread IDs for batchArchive/,
      }
    );
  });

  test("batchMarkAsRead validates non-array input", async () => {
    await assert.rejects(
      async () => {
        await defaultGmailService.batchMarkAsRead(null);
      },
      {
        message: /Must provide non-empty array of thread IDs for batchMarkAsRead/,
      }
    );
  });
});
