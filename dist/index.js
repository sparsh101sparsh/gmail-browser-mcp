#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError, } from "@modelcontextprotocol/sdk/types.js";
import { defaultGmailService } from "./services/gmail.js";
import { defaultSessionManager } from "./browser/session.js";
const server = new Server({
    name: "gmail-browser-mcp",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// Register Complete Suite of Gmail MCP Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "send_email",
                description: "Sends an email with subject, body, optional CC/BCC, and optional file attachments via browser automation using authenticated session cookies, bypassing Google Cloud Console setup and CASA audit fees.",
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
                description: "Replies to an existing conversation thread with body, optional reply-all, and optional file attachments.",
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
                description: "Forwards an existing email thread to a recipient with an optional note and attachments.",
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
                description: "Searches Gmail messages matching a search query string or structured filters (from, to, subject, is_unread, has_attachments, label) and returns structured email summary items.",
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
                description: "Reads the full contents of a specific email thread by thread ID or search query, returning sender, timestamp, body text, and attachments.",
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
        let result;
        switch (name) {
            case "send_email":
                result = await defaultGmailService.sendEmail(args);
                break;
            case "reply_email":
                result = await defaultGmailService.replyEmail(args);
                break;
            case "forward_email":
                result = await defaultGmailService.forwardEmail(args);
                break;
            case "search_emails":
                result = await defaultGmailService.searchEmails(args);
                break;
            case "read_email":
                result = await defaultGmailService.readEmail(args);
                break;
            case "save_draft":
                result = await defaultGmailService.saveDraft(args);
                break;
            case "list_drafts":
                result = await defaultGmailService.listDrafts(args);
                break;
            case "delete_draft":
                result = await defaultGmailService.deleteDraft(args);
                break;
            case "archive_email":
                result = await defaultGmailService.archiveEmail(args);
                break;
            case "move_to_inbox":
                result = await defaultGmailService.moveToInbox(args);
                break;
            case "delete_email":
                result = await defaultGmailService.deleteEmail(args);
                break;
            case "empty_trash":
                result = await defaultGmailService.emptyTrash();
                break;
            case "mark_as_read":
                result = await defaultGmailService.markAsRead(args);
                break;
            case "mark_as_unread":
                result = await defaultGmailService.markAsUnread(args);
                break;
            case "star_email":
                result = await defaultGmailService.starEmail(args);
                break;
            case "unstar_email":
                result = await defaultGmailService.unstarEmail(args);
                break;
            case "mark_as_spam":
                result = await defaultGmailService.markAsSpam(args);
                break;
            case "unmark_as_spam":
                result = await defaultGmailService.unmarkAsSpam(args);
                break;
            case "list_labels":
                result = await defaultGmailService.listLabels();
                break;
            case "create_label":
                result = await defaultGmailService.createLabel(args);
                break;
            case "delete_label":
                result = await defaultGmailService.deleteLabel(args);
                break;
            case "add_label":
                result = await defaultGmailService.addLabel(args);
                break;
            case "remove_label":
                result = await defaultGmailService.removeLabel(args);
                break;
            case "snooze_email":
                result = await defaultGmailService.snoozeEmail(args);
                break;
            case "download_attachment":
                result = await defaultGmailService.downloadAttachment(args);
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
    }
    catch (err) {
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
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[gmail-browser-mcp] Stdio MCP Server started successfully with 27 Gmail tools.");
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
//# sourceMappingURL=index.js.map