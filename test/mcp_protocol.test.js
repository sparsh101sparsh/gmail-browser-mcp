import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("MCP Protocol Implementation", () => {
  test("MCP client connects via stdio and discovers send_email, search_emails, read_email, and check_session", async () => {
    const serverPath = path.resolve("dist/index.js");

    const transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      stderr: "pipe",
    });

    const client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    try {
      await client.connect(transport);

      const toolsResult = await client.listTools();
      assert.ok(toolsResult.tools, "Tools list should be returned");

      const toolNames = toolsResult.tools.map((t) => t.name);
      console.log("Discovered Gmail tools:", toolNames);

      assert.ok(toolNames.includes("send_email"), "Must include send_email");
      assert.ok(toolNames.includes("search_emails"), "Must include search_emails");
      assert.ok(toolNames.includes("read_email"), "Must include read_email");
      assert.ok(toolNames.includes("check_session"), "Must include check_session");

      // Verify send_email schema
      const sendEmailTool = toolsResult.tools.find((t) => t.name === "send_email");
      assert.ok(sendEmailTool);
      assert.ok(sendEmailTool.inputSchema.properties.to);
      assert.ok(sendEmailTool.inputSchema.properties.subject);
      assert.ok(sendEmailTool.inputSchema.properties.body);
      assert.ok(sendEmailTool.inputSchema.properties.attachment_paths);
      assert.deepEqual(sendEmailTool.inputSchema.required, ["to", "subject", "body"]);

      // Verify search_emails schema
      const searchEmailsTool = toolsResult.tools.find((t) => t.name === "search_emails");
      assert.ok(searchEmailsTool);
      assert.ok(searchEmailsTool.inputSchema.properties.query);
      assert.ok(searchEmailsTool.inputSchema.properties.limit);
      assert.deepEqual(searchEmailsTool.inputSchema.required, ["query"]);

      // Verify read_email schema
      const readEmailTool = toolsResult.tools.find((t) => t.name === "read_email");
      assert.ok(readEmailTool);
      assert.ok(readEmailTool.inputSchema.properties.thread_id);

      // Verify check_session schema
      const checkSessionTool = toolsResult.tools.find((t) => t.name === "check_session");
      assert.ok(checkSessionTool);

      // Verify tool error handling for missing arguments via MCP protocol
      const sendErrorNoArgs = await client.callTool({
        name: "send_email",
        arguments: {},
      });
      assert.equal(sendErrorNoArgs.isError, true);
      assert.ok(
        sendErrorNoArgs.content[0].text.includes("Recipient email address ('to') cannot be empty")
      );

      const searchErrorNoArgs = await client.callTool({
        name: "search_emails",
        arguments: {},
      });
      assert.equal(searchErrorNoArgs.isError, true);
      assert.ok(searchErrorNoArgs.content[0].text.includes("Search query cannot be empty"));

      const readErrorNoArgs = await client.callTool({
        name: "read_email",
        arguments: {},
      });
      assert.equal(readErrorNoArgs.isError, true);
      assert.ok(
        readErrorNoArgs.content[0].text.includes("Must provide either 'thread_id', 'message_id', or 'search_query'")
      );
    } finally {
      await client.close().catch(() => {});
    }
  });
});
