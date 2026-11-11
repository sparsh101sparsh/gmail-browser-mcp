import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverScript = path.resolve(__dirname, "../dist/index.js");

test("Advanced Gmail Tools Suite", async (t) => {
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverScript],
    env: {
      ...process.env,
      GMAIL_HEADLESS: "true",
      GMAIL_WARM_ON_START: "false",
    },
  });

  const client = new Client(
    { name: "test-advanced-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);

  await t.test("discovers all 27 Gmail tools in MCP schema", async () => {
    const res = await client.listTools();
    const toolNames = res.tools.map((tool) => tool.name);

    const expectedTools = [
      "send_email",
      "reply_email",
      "forward_email",
      "search_emails",
      "read_email",
      "save_draft",
      "list_drafts",
      "delete_draft",
      "archive_email",
      "move_to_inbox",
      "delete_email",
      "empty_trash",
      "mark_as_read",
      "mark_as_unread",
      "star_email",
      "unstar_email",
      "mark_as_spam",
      "unmark_as_spam",
      "list_labels",
      "create_label",
      "delete_label",
      "add_label",
      "remove_label",
      "snooze_email",
      "download_attachment",
      "get_inbox_stats",
      "check_session",
    ];

    for (const tool of expectedTools) {
      assert.ok(toolNames.includes(tool), `Missing tool in registry: ${tool}`);
    }
    assert.equal(toolNames.length, 27);
  });

  await t.test("reply_email validates required body argument", async () => {
    const res = await client.callTool({
      name: "reply_email",
      arguments: {},
    });
    assert.equal(res.isError, true);
    assert.ok(res.content[0].text.includes("Reply body text cannot be empty"));
  });

  await t.test("forward_email validates required to recipient", async () => {
    const res = await client.callTool({
      name: "forward_email",
      arguments: {},
    });
    assert.equal(res.isError, true);
    assert.ok(res.content[0].text.includes("Recipient email address ('to') cannot be empty"));
  });

  await t.test("create_label validates required name argument", async () => {
    const res = await client.callTool({
      name: "create_label",
      arguments: {},
    });
    assert.equal(res.isError, true);
    assert.ok(res.content[0].text.includes("Label name cannot be empty"));
  });

  await t.test("delete_label validates required name argument", async () => {
    const res = await client.callTool({
      name: "delete_label",
      arguments: {},
    });
    assert.equal(res.isError, true);
    assert.ok(res.content[0].text.includes("Label name cannot be empty"));
  });

  await t.test("add_label validates required label argument", async () => {
    const res = await client.callTool({
      name: "add_label",
      arguments: {},
    });
    assert.equal(res.isError, true);
    assert.ok(res.content[0].text.includes("Label name cannot be empty"));
  });

  await t.test("remove_label validates required label argument", async () => {
    const res = await client.callTool({
      name: "remove_label",
      arguments: {},
    });
    assert.equal(res.isError, true);
    assert.ok(res.content[0].text.includes("Label name cannot be empty"));
  });

  await client.close();
});
