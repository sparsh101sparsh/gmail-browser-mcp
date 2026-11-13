#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { defaultGmailService } from "./services/gmail.js";
import { defaultSessionManager } from "./browser/session.js";
import { computeInboxHealth } from "./services/analytics.js";
import { defaultCache } from "./utils/cache.js";

const server = new Server(
  {
    name: "gmail-browser-mcp",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Register Complete Suite of Gmail MCP Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "send_email",
        description:
          "Sends an email with subject, body, optional CC/BCC, and optional file attachments via browser automation using authenticated session cookies, bypassing Google Cloud Console setup and CASA audit fees.",
        inputSchema: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient email address (e.g. user@example.com)." },
            subject: { type: "string", description: "Email subject line." },
            body: { type: "string", description: "Body text content of the email." },
            html: { type: "string", description: "Optional rich HTML formatted email body." },
            body_type: {
              type: "string",
              enum: ["plain", "html", "markdown"],
              description: "Formatting mode for body content.",
            },
            cc: { type: "string", description: "Optional CC recipient email address." },
            bcc: { type: "string", description: "Optional BCC recipient email address." },
            attachment_paths: {
              type: "array",
              items: { type: "string" },
              description: "Optional list of local file paths to attach (total size < 25MB).",
            },
          },
          required: ["to", "subject", "body"],
        },
      },
      {
        name: "reply_email",
        description:
          "Replies to an existing conversation thread with body, optional reply-all, and optional file attachments.",
        inputSchema: {
          type: "object",
          properties: {
            thread_id: { type: "string", description: "Target Gmail thread ID." },
            search_query: { type: "string", description: "Search query to find target thread." },
            body: { type: "string", description: "Reply message text." },
            html: { type: "string", description: "Optional rich HTML formatted reply body." },
            body_type: {
              type: "string",
              enum: ["plain", "html", "markdown"],
              description: "Formatting mode for body content.",
            },
            reply_all: { type: "boolean", description: "Whether to reply to all recipients." },
            attachment_paths: {
              type: "array",
              items: { type: "string" },
              description: "Optional local file paths to attach.",
            },
          },
          required: ["body"],
        },
      },
      {
        name: "forward_email",
        description:
          "Forwards an existing email thread to a recipient with an optional note and attachments.",
        inputSchema: {
          type: "object",
          properties: {
            thread_id: { type: "string", description: "Target Gmail thread ID." },
            search_query: { type: "string", description: "Search query to find target thread." },
            to: { type: "string", description: "Forward recipient email address." },
            body: { type: "string", description: "Optional additional note to include." },
            attachment_paths: {
              type: "array",
              items: { type: "string" },
              description: "Optional local file paths to attach.",
            },
          },
          required: ["to"],
        },
      },
      {
        name: "search_emails",
        description:
          "Searches Gmail messages matching a search query string or structured filters (from, to, subject, is_unread, has_attachments, label) and returns structured email summary items.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Gmail search query, keyword, or raw filter string." },
            from: { type: "string", description: "Filter by sender email address or name." },
            to: { type: "string", description: "Filter by recipient email address." },
            subject: { type: "string", description: "Filter by words in subject line." },
            is_unread: { type: "boolean", description: "Filter by read/unread status." },
            has_attachments: { type: "boolean", description: "Filter for messages with attachments." },
            after_date: { type: "string", description: "Filter emails sent after YYYY/MM/DD." },
            before_date: { type: "string", description: "Filter emails sent before YYYY/MM/DD." },
            label: { type: "string", description: "Filter by Gmail label name." },
            limit: {
              type: "number",
              description: "Maximum number of email threads to return (default 10, max safe limit 30).",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "read_email",
        description:
          "Reads the full contents of a specific email thread by thread ID or search query, returning sender, timestamp, body text, and attachments.",
        inputSchema: {
          type: "object",
          properties: {
            thread_id: { type: "string", description: "Gmail conversation thread ID." },
            search_query: { type: "string", description: "Search query to locate and read the top matching thread." },
          },
        },
      },
      {
        name: "save_draft",
        description: "Creates and saves an email draft in Gmail without dispatching.",
        inputSchema: {
          type: "object",
          properties: {
            to: { type: "string", description: "Optional recipient email address." },
            subject: { type: "string", description: "Optional draft subject." },
            body: { type: "string", description: "Draft body text." },
            html: { type: "string", description: "Optional rich HTML formatted draft body." },
            body_type: {
              type: "string",
              enum: ["plain", "html", "markdown"],
              description: "Formatting mode for body content.",
            },
            cc: { type: "string", description: "Optional CC recipient." },
            bcc: { type: "string", description: "Optional BCC recipient." },
            attachment_paths: { type: "array", items: { type: "string" }, description: "Optional file paths." },
          },
        },
      },
      {
        name: "list_drafts",
        description: "Lists current unsent drafts in the Gmail account.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Maximum number of drafts to return (default 10)." },
          },
        },
      },
      {
        name: "delete_draft",
        description: "Discards and deletes an email draft.",
        inputSchema: {
          type: "object",
          properties: {
            draft_id: { type: "string", description: "Optional draft thread ID." },
            query: { type: "string", description: "Optional search query to locate draft." },
          },
        },
      },
      {
        name: "archive_email",
        description: "Archives a conversation thread, removing it from Inbox.",
        inputSchema: {
          type: "object",
          properties: {
            thread_id: { type: "string", description: "Gmail conversation thread ID." },
            query: { type: "string", description: "Search query to locate thread." },
          },
        },
      },
      {
        name: "move_to_inbox",
        description: "Moves an archived email conversation back into Inbox.",
        inputSchema: {
          type: "object",
          properties: {
            thread_id: { type: "string", description: "Gmail conversation thread ID." },
            query: { type: "string", description: "Search query to locate thread." },
          },
        },
      },
      {
        name: "delete_email",
        description: "Moves an email conversation thread to Trash.",
        inputSchema: {
          type: "object",
          properties: {
            thread_id: { type: "string", description: "Gmail conversation thread ID." },
            query: { type: "string", description: "Search query to locate thread." },
          },
        },
      },
      {
        name: "empty_trash",
        description: "Permanently deletes all messages currently in the Gmail Trash folder.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "mark_as_read",
        description: "Marks an email thread as read.",
        inputSchema: {
          type: "object",
          properties: {
            thread_id: { type: "string", description: "Gmail conversation thread ID." },
            query: { type: "string", description: "Search query to locate thread." },
          },
        },
      },
      {
        name: "mark_as_unread",
        description: "Marks an email thread as unread.",
        inputSchema: {
          type: "object",
          properties: {
            thread_id: { type: "string", description: "Gmail conversation thread ID." },
            query: { type: "string", description: "Search query to locate thread." },
          },
        },
      },
      {
        name: "star_email",
        description: "Stars an email conversation thread for high priority.",
        inputSchema: {
          type: "object",
          properties: {
            thread_id: { type: "string", description: "Gmail conversation thread ID." },
            query: { type: "string", description: "Search query to locate thread." },
          },
        },
      },
      {
        name: "unstar_email",
        description: "Removes the star from an email conversation thread.",
        inputSchema: {
          type: "object",
          properties: {
            thread_id: { type: "string", description: "Gmail conversation thread ID." },
            query: { type: "string", description: "Search query to locate thread." },
          },
        },
      },
      {
        name: "mark_as_spam",
        description: "Reports an email conversation thread as spam.",
        inputSchema: {
          type: "object",
          properties: {
            thread_id: { type: "string", description: "Gmail conversation thread ID." },
            query: { type: "string", description: "Search query to locate thread." },
          },
        },
      },
      {
        name: "unmark_as_spam",
        description: "Unmarks an email thread as spam and moves it to inbox.",
        inputSchema: {
          type: "object",
          properties: {
            thread_id: { type: "string", description: "Gmail conversation thread ID." },
            query: { type: "string", description: "Search query to locate thread." },
          },
        },
      },
      {
        name: "list_labels",
        description: "Lists all system and user-defined labels in the Gmail account.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "create_label",
        description: "Creates a new custom user label in Gmail.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the new label." },
          },
          required: ["name"],
        },
      },
      {
        name: "delete_label",
        description: "Deletes an existing custom user label.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the label to remove." },
          },
          required: ["name"],
        },
      },
      {
        name: "add_label",
        description: "Applies a label to an email conversation thread.",
        inputSchema: {
          type: "object",
          properties: {
            label: { type: "string", description: "Label name to apply." },
            thread_id: { type: "string", description: "Target thread ID." },
            query: { type: "string", description: "Target search query." },
          },
          required: ["label"],
        },
      },
      {
        name: "remove_label",
        description: "Removes a label from an email conversation thread.",
        inputSchema: {
          type: "object",
          properties: {
            label: { type: "string", description: "Label name to remove." },
            thread_id: { type: "string", description: "Target thread ID." },
            query: { type: "string", description: "Target search query." },
          },
          required: ["label"],
        },
      },
      {
        name: "snooze_email",
        description: "Snoozes an email thread until a specified time or preset.",
        inputSchema: {
          type: "object",
          properties: {
            thread_id: { type: "string", description: "Target thread ID." },
            query: { type: "string", description: "Target search query." },
            until: { type: "string", description: "Snooze preset (e.g. 'Tomorrow', 'Next week')." },
          },
        },
      },
      {
        name: "download_attachment",
        description: "Downloads an email attachment to a local folder.",
        inputSchema: {
          type: "object",
          properties: {
            thread_id: { type: "string", description: "Target thread ID." },
            query: { type: "string", description: "Target search query." },
            attachment_name: { type: "string", description: "Optional specific attachment filename." },
            destination_dir: { type: "string", description: "Optional local destination folder (defaults to ~/Downloads)." },
          },
        },
      },
      {
        name: "get_inbox_stats",
        description: "Retrieves mailbox status metrics including unread counts across Primary, Promotions, Social, and Updates.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "check_session",
        description: "Validates cookie validity, checks account routing, and confirms inbox connectivity without modifying state.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

// Handle Tool Invocations
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: any;

    switch (name) {
      case "send_email":
        result = await defaultGmailService.sendEmail(args as any);
        break;
      case "reply_email":
        result = await defaultGmailService.replyEmail(args as any);
        break;
      case "forward_email":
        result = await defaultGmailService.forwardEmail(args as any);
        break;
      case "search_emails":
        result = await defaultGmailService.searchEmails(args as any);
        break;
      case "read_email":
        result = await defaultGmailService.readEmail(args as any);
        break;
      case "save_draft":
        result = await defaultGmailService.saveDraft(args as any);
        break;
      case "list_drafts":
        result = await defaultGmailService.listDrafts(args as any);
        break;
      case "delete_draft":
        result = await defaultGmailService.deleteDraft(args as any);
        break;
      case "archive_email":
        result = await defaultGmailService.archiveEmail(args as any);
        break;
      case "move_to_inbox":
        result = await defaultGmailService.moveToInbox(args as any);
        break;
      case "delete_email":
        result = await defaultGmailService.deleteEmail(args as any);
        break;
      case "empty_trash":
        result = await defaultGmailService.emptyTrash();
        break;
      case "mark_as_read":
        result = await defaultGmailService.markAsRead(args as any);
        break;
      case "mark_as_unread":
        result = await defaultGmailService.markAsUnread(args as any);
        break;
      case "star_email":
        result = await defaultGmailService.starEmail(args as any);
        break;
      case "unstar_email":
        result = await defaultGmailService.unstarEmail(args as any);
        break;
      case "mark_as_spam":
        result = await defaultGmailService.markAsSpam(args as any);
        break;
      case "unmark_as_spam":
        result = await defaultGmailService.unmarkAsSpam(args as any);
        break;
      case "list_labels":
        result = await defaultGmailService.listLabels();
        break;
      case "create_label":
        result = await defaultGmailService.createLabel(args as any);
        break;
      case "delete_label":
        result = await defaultGmailService.deleteLabel(args as any);
        break;
      case "add_label":
        result = await defaultGmailService.addLabel(args as any);
        break;
      case "remove_label":
        result = await defaultGmailService.removeLabel(args as any);
        break;
      case "snooze_email":
        result = await defaultGmailService.snoozeEmail(args as any);
        break;
      case "download_attachment":
        result = await defaultGmailService.downloadAttachment(args as any);
        break;
      case "get_inbox_stats":
        result = await defaultGmailService.getInboxStats();
        break;
      case "check_session":
        result = await defaultGmailService.checkSession();
        break;
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err: any) {
    console.error(`[mcp-error] Error handling ${name}:`, err.message);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Gmail MCP Error [${name}]: ${err.message}`,
        },
      ],
    };
  }
});

// Register MCP Resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "gmail://stats",
        name: "Gmail Live Inbox Statistics",
        description: "Real-time unread email metrics across primary, promotions, social, and updates.",
        mimeType: "application/json",
      },
      {
        uri: "gmail://health",
        name: "Gmail Inbox Health & Velocity",
        description: "Computed inbox workload health score (0-100) and actionable triage guidance.",
        mimeType: "application/json",
      },
      {
        uri: "gmail://inbox/unread",
        name: "Gmail Recent Unread Emails",
        description: "Top unread emails formatted with sender, subject, and snippet context.",
        mimeType: "text/markdown",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri === "gmail://stats") {
    let stats = defaultCache.get("resource:stats");
    if (!stats) {
      stats = await defaultGmailService.getInboxStats();
      defaultCache.set("resource:stats", stats, 15000);
    }
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  }

  if (uri === "gmail://health") {
    let stats: any = defaultCache.get("resource:stats");
    if (!stats) {
      stats = await defaultGmailService.getInboxStats();
      defaultCache.set("resource:stats", stats, 15000);
    }
    const health = computeInboxHealth(stats);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(health, null, 2),
        },
      ],
    };
  }

  if (uri === "gmail://inbox/unread") {
    const unread = await defaultGmailService.searchEmails({ is_unread: true, limit: 10 });
    const markdown = unread.emails
      .map(
        (e) =>
          `### [${e.date}] ${e.sender}: ${e.subject}\n> ${e.snippet}\n- Unread: ${e.is_unread} | Attachments: ${e.has_attachments}\n`
      )
      .join("\n---\n\n");

    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: `# Recent Unread Emails (${unread.count} total)\n\n${markdown || "_No unread emails._"}`,
        },
      ],
    };
  }

  throw new McpError(ErrorCode.InvalidRequest, `Unknown resource URI: ${uri}`);
});

// Register MCP Prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "triage-inbox",
        description: "Inspects recent unread messages and formulates an actionable priority plan.",
        arguments: [
          {
            name: "focus",
            description: "Optional category to focus on (e.g. security, billing, urgent).",
            required: false,
          },
        ],
      },
      {
        name: "draft-reply",
        description: "Author a contextual, polished reply for a target thread.",
        arguments: [
          {
            name: "thread_id",
            description: "ID of the thread to reply to.",
            required: true,
          },
          {
            name: "tone",
            description: "Tone for reply (professional, concise, friendly).",
            required: false,
          },
        ],
      },
      {
        name: "weekly-digest",
        description: "Summarizes all important notices, updates, and open requests received this week.",
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "triage-inbox") {
    const focus = args?.focus ? ` Focus specifically on: ${args.focus}.` : "";
    return {
      description: "Inbox Triage Workflow",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please fetch the unread emails using 'search_emails' or the 'gmail://inbox/unread' resource. Classify them into Critical, High, and Low priority, extract any deadlines or pending invoices, and draft immediate responses for urgent items.${focus}`,
          },
        },
      ],
    };
  }

  if (name === "draft-reply") {
    const threadId = args?.thread_id || "";
    const tone = args?.tone || "professional";
    return {
      description: "Draft Reply Workflow",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please read the email thread with ID '${threadId}' using 'read_email'. Analyze the sender's questions or requests and draft a ${tone} response ready to review or send.`,
          },
        },
      ],
    };
  }

  if (name === "weekly-digest") {
    return {
      description: "Weekly Digest Workflow",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Please search recent emails from the past 7 days using 'search_emails' and generate a clean executive digest highlighting key achievements, pending approvals, and upcoming deadlines.",
          },
        },
      ],
    };
  }

  throw new McpError(ErrorCode.InvalidRequest, `Unknown prompt: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[gmail-browser-mcp] Stdio MCP Server started successfully with 27 Gmail tools, 3 Resources, and 3 Prompts.");

  if (process.env.GMAIL_WARM_ON_START !== "false") {
    defaultSessionManager.warmup().catch((err) => {
      console.error("[gmail-browser-mcp] Background session warmup notice:", err.message);
    });
  }
}

main().catch((err) => {
  console.error("[fatal] Failed to start Gmail MCP Server:", err);
  process.exit(1);
});
