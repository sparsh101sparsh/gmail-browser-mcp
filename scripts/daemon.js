#!/usr/bin/env node

/**
 * High-Speed Gmail Background Daemon
 * Keeps a warm browser session active in memory and listens on a local
 * Unix Domain Socket (/tmp/gmail_mcp.sock) for instantaneous command execution.
 */

import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { defaultGmailService, GmailService } from "../dist/services/gmail.js";
import { defaultSessionManager, BrowserSessionManager } from "../dist/browser/session.js";

const SOCKET_PATH = process.env.GMAIL_SOCKET_PATH || "/tmp/gmail_mcp.sock";

async function main() {
  console.log(`[daemon] Starting High-Speed Gmail Background Daemon...`);

  // Remove stale socket if exists
  if (fs.existsSync(SOCKET_PATH)) {
    try {
      fs.unlinkSync(SOCKET_PATH);
    } catch {}
  }

  // Pre-warm the browser session eagerly
  console.log(`[daemon] Pre-warming browser session in RAM...`);
  try {
    await defaultSessionManager.warmup();
    console.log(`[daemon] Persistent warm session is HOT and ready in RAM.`);
  } catch (err) {
    console.warn(`[daemon] Eager warmup warning: ${err.message}. Ready on demand.`);
  }

  const server = net.createServer((socket) => {
    let buffer = "";

    socket.on("data", async (chunk) => {
      buffer += chunk.toString("utf-8");
      if (buffer.includes("\n")) {
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const startTime = performance.now();
          try {
            const req = JSON.parse(line);
            const { action, args } = req;
            let result;

            switch (action) {
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
                result = await defaultGmailService.listDrafts(args || {});
                break;
              case "get_inbox_stats":
                result = await defaultGmailService.getInboxStats();
                break;
              case "check_session":
                result = await defaultGmailService.checkSession();
                break;
              case "ping":
                result = { pong: true, time: Date.now() };
                break;
              default:
                throw new Error(`Unknown daemon action: '${action}'`);
            }

            const latencyMs = Math.round(performance.now() - startTime);
            socket.write(
              JSON.stringify({
                status: "success",
                action,
                latency_ms: latencyMs,
                data: result,
              }) + "\n"
            );
          } catch (err) {
            const latencyMs = Math.round(performance.now() - startTime);
            socket.write(
              JSON.stringify({
                status: "error",
                error: err.message || String(err),
                code: err.code || "DAEMON_ERROR",
                latency_ms: latencyMs,
              }) + "\n"
            );
          }
        }
      }
    });
  });

  server.listen(SOCKET_PATH, () => {
    console.log(`[daemon] Unix socket listening at: ${SOCKET_PATH}`);
    try {
      fs.chmodSync(SOCKET_PATH, 0o700);
    } catch {}
  });

  const cleanup = async () => {
    console.log(`[daemon] Shutting down daemon...`);
    try {
      server.close();
      if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
      await defaultSessionManager.close();
    } catch {}
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((err) => {
  console.error(`[daemon] Fatal error:`, err);
  process.exit(1);
});
