import type { Page, Locator } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { BrowserSessionManager, defaultSessionManager } from "../browser/session.js";
import { checkPageSafety, GmailSafetyError } from "../browser/guardrails.js";
import {
  defaultRateLimiter,
  RateLimiter,
  humanType,
  fastInjectText,
  fastFillRecipient,
  fastFillSubject,
} from "../utils/rate_limiter.js";
import { validateAttachments, attachFilesAndWait } from "./attachments.js";
import type {
  SendEmailArgs,
  SendEmailResult,
  SearchEmailsArgs,
  SearchEmailsResult,
  EmailSummaryItem,
  ReadEmailArgs,
  EmailDetailResult,
  EmailMessage,
  ReplyEmailArgs,
  ReplyEmailResult,
  ForwardEmailArgs,
  ForwardEmailResult,
  SaveDraftArgs,
  SaveDraftResult,
  ListDraftsArgs,
  ListDraftsResult,
  DraftSummaryItem,
  DeleteDraftArgs,
  DeleteDraftResult,
  MailboxActionArgs,
  MailboxActionResult,
  EmptyTrashResult,
  LabelActionArgs,
  LabelActionResult,
  ListLabelsResult,
  ManageLabelArgs,
  ManageLabelResult,
  SnoozeEmailArgs,
  SnoozeEmailResult,
  DownloadAttachmentArgs,
  DownloadAttachmentResult,
  GetInboxStatsResult,
  CheckSessionResult,
} from "../types.js";

export class GmailService {
  private sessionManager: BrowserSessionManager;
  private rateLimiter: RateLimiter;

  constructor(sessionManager?: BrowserSessionManager, rateLimiter?: RateLimiter) {
    this.sessionManager = sessionManager || defaultSessionManager;
    this.rateLimiter = rateLimiter || defaultRateLimiter;
  }

  // ==========================================
  // 1. OUTBOUND EMAIL: SEND, REPLY, FORWARD
  // ==========================================

  public async sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
    if (!args || typeof args !== "object") {
      throw new Error("Must provide arguments object for sendEmail.");
    }

    const to = (args.to || "").trim();
    if (!to) {
      throw new Error("Recipient email address ('to') cannot be empty.");
    }

    const subject = (args.subject || "").trim();
    const body = args.body || "";
    const cc = (args.cc || "").trim();
    const bcc = (args.bcc || "").trim();
    const attachmentPaths = Array.isArray(args.attachment_paths) ? args.attachment_paths : [];

    if (attachmentPaths.length > 0) {
      validateAttachments(attachmentPaths);
    }

    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("send_email");
      const acc = this.sessionManager.getAccountIndex();

      let composeSuccessful = false;

      // Strategy 1: Fast in-tab modal compose trigger (<50ms)
      const composeBtn = page.locator("div[gh='cm'], div[role='button']:has-text('Compose')").first();
      if (await composeBtn.isVisible().catch(() => false)) {
        try {
          console.error("[gmail] Triggering in-tab modal compose button...");
          await composeBtn.click();

          const toInput = page
            .locator("input[aria-label*='To' i], input[peoplekit-id], div[name='to'] input")
            .first();
          await toInput.waitFor({ state: "visible", timeout: 8000 });

          await fastFillRecipient(page, toInput, to);

          if (subject) {
            const subjectBox = page.locator("input[name='subjectbox'], input[aria-label*='Subject' i]").first();
            await fastFillSubject(subjectBox, subject);
          }

          if (body) {
            const bodyBox = page
              .locator("div[role='textbox'][aria-label*='Message Body' i], div[aria-label*='Message Body' i]")
              .first();
            await bodyBox.waitFor({ state: "visible", timeout: 5000 });
            await fastInjectText(page, bodyBox, body);
          }

          if (attachmentPaths.length > 0) {
            await attachFilesAndWait(page, attachmentPaths);
          }

          composeSuccessful = true;
        } catch (modalErr: any) {
          console.error(`[gmail] In-tab compose modal trigger failed: ${modalErr.message}. Falling back.`);
        }
      }

      // Strategy 2: Direct Compose URL Fallback
      if (!composeSuccessful) {
        console.error(`[gmail] Navigating to direct compose endpoint for account /u/${acc}...`);
        const composeUrl = `https://mail.google.com/mail/u/${acc}/?view=cm&fs=1&to=${encodeURIComponent(
          to
        )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        await page.goto(composeUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        await checkPageSafety(page);

        const toInput = page.locator("input[aria-label*='To' i], input[peoplekit-id], div[name='to'] input").first();
        const bodyBox = page
          .locator("div[role='textbox'][aria-label*='Message Body' i], div[aria-label*='Message Body' i]")
          .first();

        await bodyBox.waitFor({ state: "visible", timeout: 35000 });

        const isToVisible = await toInput.isVisible().catch(() => false);
        if (isToVisible) {
          const currentTo = (await toInput.inputValue().catch(() => "")).trim();
          if (!currentTo) {
            await fastFillRecipient(page, toInput, to);
          }
        }

        const subjectBox = page.locator("input[name='subjectbox'], input[aria-label*='Subject' i]").first();
        if (subject && (await subjectBox.isVisible().catch(() => false))) {
          const currentSubj = (await subjectBox.inputValue().catch(() => "")).trim();
          if (!currentSubj) {
            await fastFillSubject(subjectBox, subject);
          }
        }

        const currentBodyText = (await bodyBox.innerText().catch(() => "")).trim();
        if (!currentBodyText && body) {
          await fastInjectText(page, bodyBox, body);
        }

        if (attachmentPaths.length > 0) {
          await attachFilesAndWait(page, attachmentPaths);
        }
      }

      // Handle CC/BCC
      if (cc) {
        const ccBtn = page.locator("span[data-tooltip*='Add Cc' i], span[aria-label*='Add Cc' i]").first();
        if (await ccBtn.isVisible().catch(() => false)) {
          await ccBtn.click();
          const ccInput = page.locator("input[aria-label*='Cc' i]").first();
          await fastFillRecipient(page, ccInput, cc);
        }
      }
      if (bcc) {
        const bccBtn = page.locator("span[data-tooltip*='Add Bcc' i], span[aria-label*='Add Bcc' i]").first();
        if (await bccBtn.isVisible().catch(() => false)) {
          await bccBtn.click();
          const bccInput = page.locator("input[aria-label*='Bcc' i]").first();
          await fastFillRecipient(page, bccInput, bcc);
        }
      }

      // Dispatch send
      console.error("[gmail] Dispatching Send command...");
      const sendButton = page
        .locator(
          "div[role='button'][aria-label*='Send' i], div[role='button'][data-tooltip*='Send' i], div[role='button']:has-text('Send')"
        )
        .first();

      const sendBtnVisible = await sendButton.isVisible().catch(() => false);
      if (sendBtnVisible) {
        await sendButton.click();
      } else {
        const isMac = process.platform === "darwin";
        if (isMac) {
          await page.keyboard.press("Meta+Enter").catch(() => {});
        } else {
          await page.keyboard.press("Control+Enter").catch(() => {});
        }
      }

      // Confirmation: Wait for "Message sent" toast confirmation
      console.error("[gmail] Awaiting 'Message sent' toast confirmation...");
      let confirmed = false;
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(1000);
        const text = await page.evaluate(() => document.body.innerText).catch(() => "");
        if (text.includes("Message sent")) {
          console.error(`[gmail] Toast confirmation received: 'Message sent' at second ${i + 1}.`);
          confirmed = true;
          break;
        }
      }

      if (!confirmed) {
        const composeStillOpen = await page
          .locator("div[role='textbox'][aria-label*='Message Body' i]")
          .first()
          .isVisible()
          .catch(() => false);

        if (composeStillOpen) {
          throw new Error("Send confirmation timed out; compose editor is still open.");
        }
        console.error("[gmail] Compose editor closed; assuming successful delivery.");
      }

      this.rateLimiter.recordActionCompleted();

      return {
        status: "success",
        message: `Email successfully sent to ${to}.`,
        to,
        subject,
        sent_at: new Date().toISOString(),
        attachment_count: attachmentPaths.length,
      };
    });
  }

  public async replyEmail(args: ReplyEmailArgs): Promise<ReplyEmailResult> {
    if (!args || typeof args !== "object") {
      throw new Error("Must provide arguments object for replyEmail.");
    }
    const body = (args.body || "").trim();
    if (!body) {
      throw new Error("Reply body text cannot be empty.");
    }
    const replyAll = !!args.reply_all;
    const attachmentPaths = Array.isArray(args.attachment_paths) ? args.attachment_paths : [];

    if (attachmentPaths.length > 0) {
      validateAttachments(attachmentPaths);
    }

    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("reply_email");
      await this.openThread(page, args.thread_id, args.search_query);

      // Locate Reply or Reply All button
      const replySelector = replyAll
        ? "div[role='button'][data-tooltip*='Reply all' i], span[role='link']:has-text('Reply to all')"
        : "div[role='button'][data-tooltip*='Reply' i], span[role='link']:has-text('Reply')";

      const replyBtn = page.locator(replySelector).first();
      await replyBtn.waitFor({ state: "visible", timeout: 15000 });
      await replyBtn.click();

      // Locate reply body box
      const bodyBox = page
        .locator("div[role='textbox'][aria-label*='Message Body' i], div[aria-label*='Message Body' i]")
        .first();
      await bodyBox.waitFor({ state: "visible", timeout: 10000 });
      await fastInjectText(page, bodyBox, body);

      if (attachmentPaths.length > 0) {
        await attachFilesAndWait(page, attachmentPaths);
      }

      // Dispatch Send
      console.error("[gmail] Dispatching Reply Send command...");
      const sendButton = page
        .locator(
          "div[role='button'][aria-label*='Send' i], div[role='button'][data-tooltip*='Send' i], div[role='button']:has-text('Send')"
        )
        .first();
      if (await sendButton.isVisible().catch(() => false)) {
        await sendButton.click();
      } else {
        await page.keyboard.press("Meta+Enter").catch(() => {});
      }

      // Await confirmation
      await this.awaitToastConfirmation(page, "Message sent");
      this.rateLimiter.recordActionCompleted();

      return {
        status: "success",
        message: `Reply successfully sent${replyAll ? " (to all)" : ""}.`,
        thread_id: args.thread_id,
        replied_at: new Date().toISOString(),
        reply_all: replyAll,
        attachment_count: attachmentPaths.length,
      };
    });
  }

  public async forwardEmail(args: ForwardEmailArgs): Promise<ForwardEmailResult> {
    if (!args || typeof args !== "object") {
      throw new Error("Must provide arguments object for forwardEmail.");
    }
    const to = (args.to || "").trim();
    if (!to) {
      throw new Error("Recipient email address ('to') cannot be empty.");
    }
    const body = (args.body || "").trim();
    const attachmentPaths = Array.isArray(args.attachment_paths) ? args.attachment_paths : [];

    if (attachmentPaths.length > 0) {
      validateAttachments(attachmentPaths);
    }

    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("forward_email");
      await this.openThread(page, args.thread_id, args.search_query);

      // Locate Forward button
      const forwardBtn = page
        .locator("div[role='button'][data-tooltip*='Forward' i], span[role='link']:has-text('Forward')")
        .first();
      await forwardBtn.waitFor({ state: "visible", timeout: 15000 });
      await forwardBtn.click();

      // Locate 'To' input
      const toInput = page.locator("input[aria-label*='To' i], input[peoplekit-id], div[name='to'] input").first();
      await toInput.waitFor({ state: "visible", timeout: 10000 });
      await fastFillRecipient(page, toInput, to);

      if (body) {
        const bodyBox = page
          .locator("div[role='textbox'][aria-label*='Message Body' i], div[aria-label*='Message Body' i]")
          .first();
        await bodyBox.waitFor({ state: "visible", timeout: 8000 });
        await fastInjectText(page, bodyBox, body);
      }

      if (attachmentPaths.length > 0) {
        await attachFilesAndWait(page, attachmentPaths);
      }

      // Send
      console.error("[gmail] Dispatching Forward Send command...");
      const sendButton = page
        .locator(
          "div[role='button'][aria-label*='Send' i], div[role='button'][data-tooltip*='Send' i], div[role='button']:has-text('Send')"
        )
        .first();
      if (await sendButton.isVisible().catch(() => false)) {
        await sendButton.click();
      } else {
        await page.keyboard.press("Meta+Enter").catch(() => {});
      }

      await this.awaitToastConfirmation(page, "Message sent");
      this.rateLimiter.recordActionCompleted();

      return {
        status: "success",
        message: `Email successfully forwarded to ${to}.`,
        to,
        thread_id: args.thread_id,
        forwarded_at: new Date().toISOString(),
        attachment_count: attachmentPaths.length,
      };
    });
  }

  // ==========================================
  // 2. DRAFTS MANAGEMENT: SAVE, LIST, DELETE
  // ==========================================

  public async saveDraft(args: SaveDraftArgs): Promise<SaveDraftResult> {
    const to = (args.to || "").trim();
    const subject = (args.subject || "").trim();
    const body = (args.body || "").trim();
    const attachmentPaths = Array.isArray(args.attachment_paths) ? args.attachment_paths : [];

    if (attachmentPaths.length > 0) {
      validateAttachments(attachmentPaths);
    }

    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("save_draft");
      const composeBtn = page.locator("div[gh='cm'], div[role='button']:has-text('Compose')").first();
      await composeBtn.waitFor({ state: "visible", timeout: 10000 });
      await composeBtn.click();

      if (to) {
        const toInput = page.locator("input[aria-label*='To' i], div[name='to'] input").first();
        await toInput.waitFor({ state: "visible", timeout: 8000 });
        await fastFillRecipient(page, toInput, to);
      }

      if (subject) {
        const subjectBox = page.locator("input[name='subjectbox'], input[aria-label*='Subject' i]").first();
        await fastFillSubject(subjectBox, subject);
      }

      if (body) {
        const bodyBox = page
          .locator("div[role='textbox'][aria-label*='Message Body' i], div[aria-label*='Message Body' i]")
          .first();
        await bodyBox.waitFor({ state: "visible", timeout: 6000 });
        await fastInjectText(page, bodyBox, body);
      }

      if (attachmentPaths.length > 0) {
        await attachFilesAndWait(page, attachmentPaths);
      }

      // Wait 1500ms for Gmail auto-save indicator ("Saved")
      console.error("[gmail] Waiting for draft auto-save confirmation...");
      await page.waitForTimeout(1500);

      // Close modal to preserve draft
      const closeBtn = page
        .locator("img[aria-label*='Save & close' i], img[alt='Close'], div[role='button'][aria-label*='Close' i]")
        .first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
      }

      this.rateLimiter.recordActionCompleted();

      return {
        status: "success",
        message: "Draft successfully saved in Gmail.",
        saved_at: new Date().toISOString(),
        attachment_count: attachmentPaths.length,
      };
    });
  }

  public async listDrafts(args: ListDraftsArgs): Promise<ListDraftsResult> {
    const limit = this.rateLimiter.clampSearchLimit(args?.limit ?? 10);

    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("list_drafts");
      const acc = this.sessionManager.getAccountIndex();
      await page.goto(`https://mail.google.com/mail/u/${acc}/#drafts`, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      await checkPageSafety(page);

      const rows = page.locator("tr.zA");
      const count = await rows.count();
      const countToExtract = Math.min(count, limit);
      const drafts: DraftSummaryItem[] = [];

      for (let i = 0; i < countToExtract; i++) {
        const row = rows.nth(i);
        try {
          const toEl = row.locator("span.bA4 span, .yX span").first();
          const to = (await toEl.innerText().catch(() => "")) || "Draft";

          const subjectEl = row.locator("span.bq9, .bog span, span.y6 span").first();
          const subject = (await subjectEl.innerText().catch(() => "")) || "(No Subject)";

          const snippetEl = row.locator("span.y2").first();
          const snippet = (await snippetEl.innerText().catch(() => "")).replace(/^[\s\-–—]+/, "").trim();

          const dateEl = row.locator("td.xW span, td.xW").first();
          const date = (await dateEl.innerText().catch(() => "")) || "";

          const threadId = (await row.getAttribute("data-legacy-thread-id")) || undefined;

          drafts.push({
            id: threadId,
            to: to.trim(),
            subject: subject.trim(),
            snippet,
            date: date.trim(),
          });
        } catch {}
      }

      this.rateLimiter.recordActionCompleted();
      return { count: drafts.length, drafts };
    });
  }

  public async deleteDraft(args: DeleteDraftArgs): Promise<DeleteDraftResult> {
    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("delete_draft");
      const acc = this.sessionManager.getAccountIndex();
      const targetQuery = args.query || (args.draft_id ? `draft:${args.draft_id}` : "is:draft");

      await page.goto(`https://mail.google.com/mail/u/${acc}/#search/${encodeURIComponent(targetQuery)}`, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      await checkPageSafety(page);
      const firstRow = page.locator("tr.zA").first();
      if (!(await firstRow.isVisible({ timeout: 8000 }).catch(() => false))) {
        throw new Error("Draft not found.");
      }

      await firstRow.click();
      const discardBtn = page
        .locator("div[role='button'][data-tooltip*='Discard draft' i], div[aria-label*='Discard draft' i], div[act='11']")
        .first();
      await discardBtn.waitFor({ state: "visible", timeout: 8000 });
      await discardBtn.click();

      await this.awaitToastConfirmation(page, "Draft discarded");
      this.rateLimiter.recordActionCompleted();

      return {
        status: "success",
        message: "Draft successfully discarded.",
      };
    });
  }

  // ==========================================
  // 3. SEARCH & READ EMAILS
  // ==========================================

  public async searchEmails(args: SearchEmailsArgs): Promise<SearchEmailsResult> {
    if (!args || typeof args !== "object") {
      throw new Error("Must provide arguments object for searchEmails.");
    }

    const query = (args.query || "").trim();
    if (!query) {
      throw new Error("Search query cannot be empty.");
    }

    const limit = this.rateLimiter.clampSearchLimit(args.limit);

    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("search_emails");
      const acc = this.sessionManager.getAccountIndex();
      console.error(`[gmail] Executing inbox search with query: "${query}" (limit: ${limit})...`);

      const currentUrl = page.url();
      const searchTargetUrl = `https://mail.google.com/mail/u/${acc}/#search/${encodeURIComponent(query)}`;

      if (currentUrl.includes(`/mail/u/${acc}/`)) {
        const searchInput = page.locator("input[name='q'], input[aria-label*='Search mail' i]").first();
        if (await searchInput.isVisible().catch(() => false)) {
          await searchInput.fill(query);
          await page.keyboard.press("Enter");
        } else {
          await page.goto(searchTargetUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
        }
      } else {
        await page.goto(searchTargetUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
      }

      await checkPageSafety(page);

      const rowsLocator = page.locator("tr.zA").first();
      const emptyNoticeLocator = page
        .locator(
          "td:has-text('No messages matched your search'), td:has-text('did not match any documents'), div:has-text('No results')"
        )
        .first();

      await Promise.race([
        rowsLocator.waitFor({ state: "visible", timeout: 12000 }).catch(() => {}),
        emptyNoticeLocator.waitFor({ state: "visible", timeout: 12000 }).catch(() => {}),
      ]);

      const emptyNotice = await emptyNoticeLocator.isVisible().catch(() => false);
      if (emptyNotice) {
        console.error("[gmail] Search returned 0 results.");
        this.rateLimiter.recordActionCompleted();
        return { query, count: 0, emails: [] };
      }

      const rows = page.locator("tr.zA");
      const totalFound = await rows.count();
      const countToExtract = Math.min(totalFound, limit);

      const emails: EmailSummaryItem[] = [];

      for (let i = 0; i < countToExtract; i++) {
        const row = rows.nth(i);
        try {
          const rowClass = (await row.getAttribute("class")) || "";
          const is_unread = rowClass.includes("zE");

          const senderEl = row.locator("span.bA4 span, .yX span, span[email]").first();
          const sender = (await senderEl.innerText().catch(() => "")) || "Unknown Sender";
          const sender_email = (await senderEl.getAttribute("email").catch(() => "")) || undefined;

          const subjectEl = row.locator("span.bq9, .bog span, span.y6 span").first();
          const subject = (await subjectEl.innerText().catch(() => "")) || "(No Subject)";

          const snippetEl = row.locator("span.y2").first();
          const rawSnippet = await snippetEl.innerText().catch(() => "");
          const snippet = rawSnippet.replace(/^[\s\-–—]+/, "").trim();

          const dateEl = row.locator("td.xW span, td.xW").first();
          const date = (await dateEl.innerText().catch(() => "")) || "";

          const hasAttachmentEl = row
            .locator("span[data-tooltip*='attachment' i], .brd, svg[data-icon='attachment']")
            .first();
          const has_attachments = await hasAttachmentEl.isVisible().catch(() => false);
          const threadId = (await row.getAttribute("data-legacy-thread-id")) || undefined;

          emails.push({
            thread_id: threadId,
            sender: sender.trim(),
            sender_email,
            subject: subject.trim(),
            snippet,
            date: date.trim(),
            is_unread,
            has_attachments,
          });
        } catch (rowErr) {
          console.error(`[gmail] Error parsing search result row ${i}:`, rowErr);
        }
      }

      this.rateLimiter.recordActionCompleted();
      return { query, count: emails.length, emails };
    });
  }

  public async readEmail(args: ReadEmailArgs): Promise<EmailDetailResult> {
    if (!args || typeof args !== "object") {
      throw new Error("Must provide arguments object for readEmail.");
    }

    const threadId = (args.thread_id || "").trim();
    const messageId = (args.message_id || "").trim();
    const searchQuery = (args.search_query || "").trim();

    if (!threadId && !messageId && !searchQuery) {
      throw new Error("Must provide either 'thread_id', 'message_id', or 'search_query' to identify email.");
    }

    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("read_email");
      await this.openThread(page, threadId, searchQuery);

      const subjectEl = page.locator("h2.hP, div[role='main'] h2").first();
      await subjectEl.waitFor({ state: "visible", timeout: 15000 });
      const subject = (await subjectEl.innerText().catch(() => "")) || "(No Subject)";

      const messageContainers = page.locator("div.gs, div.adn");
      const messageCount = await messageContainers.count();
      const messages: EmailMessage[] = [];

      for (let i = 0; i < messageCount; i++) {
        const msg = messageContainers.nth(i);
        try {
          const senderEl = msg.locator("span.gD, span[email]").first();
          const sender =
            (await senderEl.getAttribute("email").catch(() => "")) ||
            (await senderEl.innerText().catch(() => "")) ||
            "Unknown";

          const dateEl = msg.locator("span.g3").first();
          const date = (await dateEl.innerText().catch(() => "")) || "";

          const bodyEl = msg.locator("div.a3s.aiL, div[dir='ltr']").first();
          const rawBody = (await bodyEl.innerText().catch(() => "")) || "";
          const body = rawBody
            .replace(/<<<PROMPT_INJECTION_DEFENSE>>>/g, "")
            .slice(0, 50000);

          const attachmentEls = msg.locator("span.aV3, a[download], div.aZo");
          const attCount = await attachmentEls.count();
          const attachments: string[] = [];
          for (let j = 0; j < attCount; j++) {
            const attName = await attachmentEls.nth(j).innerText().catch(() => "");
            if (attName.trim()) attachments.push(attName.trim());
          }

          messages.push({ sender, date, body, attachments });
        } catch (msgErr) {
          console.error(`[gmail] Error parsing message container ${i}:`, msgErr);
        }
      }

      this.rateLimiter.recordActionCompleted();
      return {
        thread_id: threadId || "search_match",
        subject,
        messages,
      };
    });
  }

  // ==========================================
  // 4. MAILBOX TRIAGE & ORGANIZATION
  // ==========================================

  public async archiveEmail(args: MailboxActionArgs): Promise<MailboxActionResult> {
    return await this.executeMailboxAction(
      "archive_email",
      args,
      "div[role='button'][data-tooltip*='Archive' i], div[act='7'], div[aria-label*='Archive' i]",
      "Conversation archived"
    );
  }

  public async moveToInbox(args: MailboxActionArgs): Promise<MailboxActionResult> {
    return await this.executeMailboxAction(
      "move_to_inbox",
      args,
      "div[role='button'][data-tooltip*='Move to Inbox' i], div[act='8'], div[aria-label*='Move to Inbox' i]",
      "Conversation moved to Inbox"
    );
  }

  public async deleteEmail(args: MailboxActionArgs): Promise<MailboxActionResult> {
    return await this.executeMailboxAction(
      "delete_email",
      args,
      "div[role='button'][data-tooltip*='Delete' i], div[act='10'], div[aria-label*='Delete' i]",
      "Conversation moved to Trash"
    );
  }

  public async emptyTrash(): Promise<EmptyTrashResult> {
    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("empty_trash");
      const acc = this.sessionManager.getAccountIndex();
      await page.goto(`https://mail.google.com/mail/u/${acc}/#trash`, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      await checkPageSafety(page);

      const emptyLink = page
        .locator(
          "span:has-text('Empty Trash now'), a:has-text('Empty Trash now'), div[role='button']:has-text('Empty Trash now')"
        )
        .first();

      if (!(await emptyLink.isVisible({ timeout: 8000 }).catch(() => false))) {
        return { status: "success", message: "Trash is already empty.", emptied_at: new Date().toISOString() };
      }

      await emptyLink.click();
      const confirmOkBtn = page.locator("button[name='ok'], div[role='button']:has-text('OK')").first();
      await confirmOkBtn.waitFor({ state: "visible", timeout: 5000 });
      await confirmOkBtn.click();

      await this.awaitToastConfirmation(page, "Trash emptied");
      this.rateLimiter.recordActionCompleted();

      return {
        status: "success",
        message: "Trash successfully emptied.",
        emptied_at: new Date().toISOString(),
      };
    });
  }

  public async markAsRead(args: MailboxActionArgs): Promise<MailboxActionResult> {
    return await this.executeMailboxAction(
      "mark_as_read",
      args,
      "div[role='button'][data-tooltip*='Mark as read' i], div[act='1'], div[aria-label*='Mark as read' i]",
      "Marked as read"
    );
  }

  public async markAsUnread(args: MailboxActionArgs): Promise<MailboxActionResult> {
    return await this.executeMailboxAction(
      "mark_as_unread",
      args,
      "div[role='button'][data-tooltip*='Mark as unread' i], div[act='2'], div[aria-label*='Mark as unread' i]",
      "Marked as unread"
    );
  }

  public async starEmail(args: MailboxActionArgs): Promise<MailboxActionResult> {
    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("star_email");
      await this.selectThreadRow(page, args.thread_id, args.query);

      const starBtn = page.locator("tr.zA span.T-KT, span[role='checkbox'][aria-label*='Star' i]").first();
      await starBtn.waitFor({ state: "visible", timeout: 8000 });
      await starBtn.click();

      this.rateLimiter.recordActionCompleted();
      return {
        status: "success",
        message: "Email successfully starred.",
        action: "star",
        target: args.thread_id || args.query,
        timestamp: new Date().toISOString(),
      };
    });
  }

  public async unstarEmail(args: MailboxActionArgs): Promise<MailboxActionResult> {
    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("unstar_email");
      await this.selectThreadRow(page, args.thread_id, args.query);

      const starBtn = page.locator("tr.zA span.T-KT, span[role='checkbox'][aria-label*='Starred' i]").first();
      await starBtn.waitFor({ state: "visible", timeout: 8000 });
      await starBtn.click();

      this.rateLimiter.recordActionCompleted();
      return {
        status: "success",
        message: "Email successfully unstarred.",
        action: "unstar",
        target: args.thread_id || args.query,
        timestamp: new Date().toISOString(),
      };
    });
  }

  public async markAsSpam(args: MailboxActionArgs): Promise<MailboxActionResult> {
    return await this.executeMailboxAction(
      "mark_as_spam",
      args,
      "div[role='button'][data-tooltip*='Report spam' i], div[act='9'], div[aria-label*='Report spam' i]",
      "Conversation reported as spam"
    );
  }

  public async unmarkAsSpam(args: MailboxActionArgs): Promise<MailboxActionResult> {
    return await this.executeMailboxAction(
      "unmark_as_spam",
      args,
      "div[role='button'][data-tooltip*='Not spam' i], div[act='13'], div[aria-label*='Not spam' i]",
      "Conversation unmarked as spam"
    );
  }

  // ==========================================
  // 5. LABELS & CATEGORIES
  // ==========================================

  public async listLabels(): Promise<ListLabelsResult> {
    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("list_labels");
      const acc = this.sessionManager.getAccountIndex();
      await page.goto(`https://mail.google.com/mail/u/${acc}/#inbox`, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      const systemLabels = ["Inbox", "Starred", "Snoozed", "Sent", "Drafts", "Spam", "Trash", "Purchases"];
      const userLabels: string[] = [];

      const labelElements = page.locator("div[role='navigation'] a[href*='#label/']");
      const count = await labelElements.count();
      for (let i = 0; i < count; i++) {
        const txt = await labelElements.nth(i).innerText().catch(() => "");
        const cleanName = txt.split("\n")[0].trim();
        if (cleanName && !userLabels.includes(cleanName)) {
          userLabels.push(cleanName);
        }
      }

      this.rateLimiter.recordActionCompleted();
      return {
        system_labels: systemLabels,
        user_labels: userLabels,
        total_count: systemLabels.length + userLabels.length,
      };
    });
  }

  public async createLabel(args: ManageLabelArgs): Promise<ManageLabelResult> {
    const name = (args.name || "").trim();
    if (!name) throw new Error("Label name cannot be empty.");

    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("create_label");
      const acc = this.sessionManager.getAccountIndex();
      await page.goto(`https://mail.google.com/mail/u/${acc}/#inbox`, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      // Expand "More" on sidebar if visible
      const moreBtn = page.locator("span.CJ:has-text('More'), div[role='button']:has-text('More')").first();
      if (await moreBtn.isVisible().catch(() => false)) {
        await moreBtn.click();
      }

      const createLabelBtn = page
        .locator("div[role='button']:has-text('Create new label'), span:has-text('Create new label')")
        .first();
      await createLabelBtn.waitFor({ state: "visible", timeout: 8000 });
      await createLabelBtn.click();

      // Input name in modal
      const labelInput = page.locator("input[type='text'].xx").first();
      await labelInput.waitFor({ state: "visible", timeout: 5000 });
      await fastInjectText(page, labelInput, name);

      const submitBtn = page.locator("button[name='ok'], div[role='button']:has-text('Create')").first();
      await submitBtn.click();

      await this.awaitToastConfirmation(page, "created");
      this.rateLimiter.recordActionCompleted();

      return {
        status: "success",
        message: `Label '${name}' successfully created.`,
        label_name: name,
        action: "created",
      };
    });
  }

  public async deleteLabel(args: ManageLabelArgs): Promise<ManageLabelResult> {
    const name = (args.name || "").trim();
    if (!name) throw new Error("Label name cannot be empty.");

    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("delete_label");
      const acc = this.sessionManager.getAccountIndex();
      await page.goto(`https://mail.google.com/mail/u/${acc}/#settings/labels`, {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });

      const labelRow = page.locator(`tr:has-text("${name}")`).first();
      if (!(await labelRow.isVisible({ timeout: 8000 }).catch(() => false))) {
        throw new Error(`Label '${name}' not found.`);
      }

      const removeBtn = labelRow.locator("span:has-text('remove'), span:has-text('Delete')").first();
      await removeBtn.click();

      const confirmBtn = page.locator("button[name='ok'], div[role='button']:has-text('Delete')").first();
      await confirmBtn.waitFor({ state: "visible", timeout: 5000 });
      await confirmBtn.click();

      await this.awaitToastConfirmation(page, "removed");
      this.rateLimiter.recordActionCompleted();

      return {
        status: "success",
        message: `Label '${name}' successfully deleted.`,
        label_name: name,
        action: "deleted",
      };
    });
  }

  public async addLabel(args: LabelActionArgs): Promise<LabelActionResult> {
    const label = (args.label || "").trim();
    if (!label) throw new Error("Label name cannot be empty.");

    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("add_label");
      await this.selectThreadRow(page, args.thread_id, args.query);

      const labelsBtn = page
        .locator("div[role='button'][data-tooltip*='Labels' i], div[act='16'], div[aria-label*='Labels' i]")
        .first();
      await labelsBtn.waitFor({ state: "visible", timeout: 8000 });
      await labelsBtn.click();

      const filterInput = page.locator("input[aria-label*='Label as' i], input[type='text'].J-M").first();
      if (await filterInput.isVisible().catch(() => false)) {
        await fastInjectText(page, filterInput, label);
      }

      const targetMenuItem = page.locator(`div[role='menuitemcheckbox']:has-text("${label}")`).first();
      if (await targetMenuItem.isVisible({ timeout: 5000 }).catch(() => false)) {
        await targetMenuItem.click();
      }

      const applyBtn = page.locator("div[role='button']:has-text('Apply')").first();
      if (await applyBtn.isVisible().catch(() => false)) {
        await applyBtn.click();
      }

      await this.awaitToastConfirmation(page, "The conversation has been added to");
      this.rateLimiter.recordActionCompleted();

      return {
        status: "success",
        message: `Label '${label}' successfully added.`,
        label,
        action: "add",
        target: args.thread_id || args.query,
      };
    });
  }

  public async removeLabel(args: LabelActionArgs): Promise<LabelActionResult> {
    const label = (args.label || "").trim();
    if (!label) throw new Error("Label name cannot be empty.");

    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("remove_label");
      await this.openThread(page, args.thread_id, args.query);

      const chipClose = page.locator(`div[aria-label*="Remove label ${label}" i], span.av:has-text("${label}") span.aw`).first();
      if (await chipClose.isVisible({ timeout: 8000 }).catch(() => false)) {
        await chipClose.click();
      } else {
        const labelsBtn = page.locator("div[role='button'][data-tooltip*='Labels' i]").first();
        await labelsBtn.click();
        const targetItem = page.locator(`div[role='menuitemcheckbox']:has-text("${label}")`).first();
        if (await targetItem.isVisible().catch(() => false)) {
          await targetItem.click();
        }
        const applyBtn = page.locator("div[role='button']:has-text('Apply')").first();
        if (await applyBtn.isVisible().catch(() => false)) {
          await applyBtn.click();
        }
      }

      await this.awaitToastConfirmation(page, "removed");
      this.rateLimiter.recordActionCompleted();

      return {
        status: "success",
        message: `Label '${label}' successfully removed.`,
        label,
        action: "remove",
        target: args.thread_id || args.query,
      };
    });
  }

  // ==========================================
  // 6. SNOOZE, ATTACHMENTS & MAILBOX METRICS
  // ==========================================

  public async snoozeEmail(args: SnoozeEmailArgs): Promise<SnoozeEmailResult> {
    const until = (args.until || "Tomorrow").trim();

    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("snooze_email");
      await this.selectThreadRow(page, args.thread_id, args.query);

      const snoozeBtn = page
        .locator("div[role='button'][data-tooltip*='Snooze' i], div[aria-label*='Snooze' i]")
        .first();
      await snoozeBtn.waitFor({ state: "visible", timeout: 8000 });
      await snoozeBtn.click();

      // Click snooze preset
      const presetLocator = page
        .locator(`div[role='menuitem']:has-text("${until}"), div[role='menuitem']:first-child`)
        .first();
      await presetLocator.waitFor({ state: "visible", timeout: 5000 });
      await presetLocator.click();

      await this.awaitToastConfirmation(page, "Snoozed until");
      this.rateLimiter.recordActionCompleted();

      return {
        status: "success",
        message: `Email successfully snoozed until ${until}.`,
        snoozed_until: until,
        target: args.thread_id || args.query,
      };
    });
  }

  public async downloadAttachment(args: DownloadAttachmentArgs): Promise<DownloadAttachmentResult> {
    const destDir = args.destination_dir ? path.resolve(args.destination_dir) : path.join(os.homedir(), "Downloads");
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("download_attachment");
      await this.openThread(page, args.thread_id, args.query);

      // Locate download link or attachment hover element
      const downloadLink = page
        .locator(
          "div[role='link'][aria-label*='Download' i], a[download], div[data-tooltip*='Download' i], span.aV3"
        )
        .first();

      await downloadLink.waitFor({ state: "visible", timeout: 15000 });

      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 20000 }),
        downloadLink.click(),
      ]);

      const filename = download.suggestedFilename() || args.attachment_name || "attachment";
      const savedPath = path.join(destDir, filename);
      await download.saveAs(savedPath);

      const stats = fs.statSync(savedPath);
      this.rateLimiter.recordActionCompleted();

      return {
        status: "success",
        message: `Attachment successfully downloaded to ${savedPath}.`,
        filename,
        saved_path: savedPath,
        size_bytes: stats.size,
      };
    });
  }

  public async getInboxStats(): Promise<GetInboxStatsResult> {
    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing("get_inbox_stats");
      const acc = this.sessionManager.getAccountIndex();
      await page.goto(`https://mail.google.com/mail/u/${acc}/#inbox`, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      await checkPageSafety(page);

      // Extract unread inbox count from sidebar link: e.g. "Inbox 1,038"
      const inboxLink = page.locator("div[role='navigation'] a[href*='#inbox']").first();
      const rawText = (await inboxLink.innerText().catch(() => "")) || "";
      const unreadMatch = rawText.match(/(\d+[\d,]*)/);
      const unreadTotal = unreadMatch ? parseInt(unreadMatch[1].replace(/,/g, ""), 10) : 0;

      // Extract unread badges from Category Tabs (Primary, Promotions, Social, Updates)
      const categories = {
        primary: 0,
        promotions: 0,
        social: 0,
        updates: 0,
      };

      const primaryTab = page.locator("div[role='tab'][aria-label*='Primary' i]").first();
      const promoTab = page.locator("div[role='tab'][aria-label*='Promotions' i]").first();
      const socialTab = page.locator("div[role='tab'][aria-label*='Social' i]").first();
      const updatesTab = page.locator("div[role='tab'][aria-label*='Updates' i]").first();

      const parseTabBadge = async (locator: Locator) => {
        const txt = await locator.innerText().catch(() => "");
        const m = txt.match(/(\d+[\d,]*)/);
        return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
      };

      categories.primary = await parseTabBadge(primaryTab);
      categories.promotions = await parseTabBadge(promoTab);
      categories.social = await parseTabBadge(socialTab);
      categories.updates = await parseTabBadge(updatesTab);

      this.rateLimiter.recordActionCompleted();

      return {
        unread_primary: categories.primary || unreadTotal,
        unread_total: unreadTotal,
        categories,
        checked_at: new Date().toISOString(),
      };
    });
  }

  public async checkSession(): Promise<CheckSessionResult> {
    return await this.sessionManager.withWarmPage(async (page: Page) => {
      const acc = this.sessionManager.getAccountIndex();
      const url = `https://mail.google.com/mail/u/${acc}/#inbox`;

      console.error(`[gmail] Verifying session health at ${url}...`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });

      await checkPageSafety(page);

      const title = await page.title();
      const currentUrl = page.url();

      const authenticated = currentUrl.includes("mail.google.com") && !currentUrl.includes("/signin/");

      return {
        authenticated,
        accountIndex: acc,
        message: authenticated
          ? `Authenticated active Gmail session (Account index /u/${acc}, title: "${title}").`
          : "Session is unauthenticated or redirected to Google sign-in.",
      };
    });
  }

  // ==========================================
  // INTERNAL HELPERS
  // ==========================================

  private async openThread(page: Page, threadId?: string, query?: string): Promise<void> {
    const acc = this.sessionManager.getAccountIndex();
    if (threadId) {
      await page.goto(`https://mail.google.com/mail/u/${acc}/#inbox/${encodeURIComponent(threadId)}`, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      await checkPageSafety(page);
    } else if (query) {
      await page.goto(`https://mail.google.com/mail/u/${acc}/#search/${encodeURIComponent(query)}`, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      await checkPageSafety(page);
      const firstRow = page.locator("tr.zA").first();
      await firstRow.waitFor({ state: "visible", timeout: 12000 });
      await firstRow.click();
    } else {
      throw new Error("Must provide either thread_id or query to open conversation.");
    }
  }

  private async selectThreadRow(page: Page, threadId?: string, query?: string): Promise<void> {
    const acc = this.sessionManager.getAccountIndex();
    const searchTarget = query || (threadId ? `rfc822msgid:${threadId}` : undefined);
    const targetUrl = searchTarget
      ? `https://mail.google.com/mail/u/${acc}/#search/${encodeURIComponent(searchTarget)}`
      : `https://mail.google.com/mail/u/${acc}/#inbox`;

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await checkPageSafety(page);

    const firstRow = page.locator("tr.zA").first();
    await firstRow.waitFor({ state: "visible", timeout: 12000 });

    const checkbox = firstRow.locator("div[role='checkbox'], .oZ-jc").first();
    if (await checkbox.isVisible().catch(() => false)) {
      await checkbox.click();
    }
  }

  private async executeMailboxAction(
    actionName: string,
    args: MailboxActionArgs,
    buttonSelector: string,
    expectedToast: string
  ): Promise<MailboxActionResult> {
    return await this.sessionManager.withWarmPage(async (page: Page) => {
      await this.rateLimiter.enforcePacing(actionName);
      await this.selectThreadRow(page, args.thread_id, args.query);

      const actionBtn = page.locator(buttonSelector).first();
      await actionBtn.waitFor({ state: "visible", timeout: 8000 });
      await actionBtn.click();

      await this.awaitToastConfirmation(page, expectedToast);
      this.rateLimiter.recordActionCompleted();

      return {
        status: "success",
        message: `Action '${actionName}' successfully completed.`,
        action: actionName,
        target: args.thread_id || args.query,
        timestamp: new Date().toISOString(),
      };
    });
  }

  private async awaitToastConfirmation(page: Page, keyword: string): Promise<boolean> {
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(500);
      const text = await page.evaluate(() => document.body.innerText).catch(() => "");
      if (text.toLowerCase().includes(keyword.toLowerCase())) {
        return true;
      }
    }
    return false;
  }
}

export const defaultGmailService = new GmailService();
