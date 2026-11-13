import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

describe("MCP Resources & Prompts Test Suite", () => {
  test("MCP client discovers all resources and prompts", async () => {
    const distPath = path.resolve("dist/index.js");
    const transport = new StdioClientTransport({
      command: "node",
      args: [distPath],
    });

    const client = new Client(
      {
        name: "test-mcp-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);

    // 1. Verify Resources List
    const resourcesList = await client.listResources();
    assert.strictEqual(Array.isArray(resourcesList.resources), true);
    const uris = resourcesList.resources.map((r) => r.uri);
    assert.strictEqual(uris.includes("gmail://stats"), true);
    assert.strictEqual(uris.includes("gmail://health"), true);
    assert.strictEqual(uris.includes("gmail://inbox/unread"), true);

    // 2. Verify Prompts List
    const promptsList = await client.listPrompts();
    assert.strictEqual(Array.isArray(promptsList.prompts), true);
    const promptNames = promptsList.prompts.map((p) => p.name);
    assert.strictEqual(promptNames.includes("triage-inbox"), true);
    assert.strictEqual(promptNames.includes("draft-reply"), true);
    assert.strictEqual(promptNames.includes("weekly-digest"), true);

    // 3. Verify Prompt Retrieval
    const triagePrompt = await client.getPrompt({
      name: "triage-inbox",
      arguments: { focus: "security" },
    });
    assert.strictEqual(triagePrompt.messages.length > 0, true);
    assert.strictEqual(
      triagePrompt.messages[0].content.text.includes("Focus specifically on: security"),
      true
    );

    await client.close();
  });
});
