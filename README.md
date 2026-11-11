# Gmail Browser MCP (`gmail-browser-mcp`)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Protocol%20v1.0-purple.svg)](https://modelcontextprotocol.io/)
[![Playwright](https://img.shields.io/badge/Playwright-Chromium-green.svg)](https://playwright.dev/)
[![Tests](https://img.shields.io/badge/Tests-93%20Passing%20(100%25)-brightgreen.svg)](./test)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A high-performance, browser-automated [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for **Gmail**. Powered by Playwright, native Google Chrome, atomic Chrome DevTools Protocol (CDP) text injection, and authenticated session cookies.

Enables Large Language Models (Claude, Gemini, ChatGPT, Codex) to execute all standard user actions in Gmail in a **single conversational turn**—with **zero GCP setup**, **no OAuth consent screens**, and **no costly CASA Tier 2/3 security audits**.

---

## 🚀 Key Differentiators & Performance

| Capability | Traditional GCP OAuth / Workspace MCP | Generic Browser MCP (Agent-driven) | `gmail-browser-mcp` (This Server) |
| :--- | :--- | :--- | :--- |
| **GCP Cloud Console Setup** | Mandatory (API keys, OAuth client, Scopes) | None | **None (Zero cloud setup)** |
| **CASA Tier 2/3 Security Audit** | **Required** ($3,000 – $15,000/yr recurring) | None | **$0 (Completely eliminated)** |
| **Account Compatibility** | Restricted by OAuth consent app verification | Any account | **Personal `@gmail.com` + Workspace** |
| **Turn / Token Consumption** | 1 turn (~500 tokens) | 15–30 turns (30,000–60,000 tokens) | **1 turn (~650 tokens, 97.7% reduction)** |
| **Dispatch Latency** | ~200ms – 500ms (REST API) | 25,000ms – 45,000ms (DOM loops) | **~250ms – 300ms (Warm Session Pool)** |
| **Tool Surface** | Limited API scopes | Unstructured mouse/clicks | **27 Structured Semantic Tools** |

---

## ⚡ Sub-Second Speed Benchmark

By maintaining a persistent warm page session pool (`withWarmPage`) and utilizing atomic Chrome DevTools Protocol text injection (`Input.insertText`), `gmail-browser-mcp` delivers sub-second email dispatch:

```
============================================================
            SPEED BENCHMARK EMPIRICAL RESULTS               
============================================================
- Compose Modal Open:      43.02 ms (Threshold: < 350ms)
- Recipient Tokenization:   5.30 ms (Threshold: < 150ms)
- Subject Fast Fill:        1.99 ms (Threshold: < 50ms)
- Body CDP Insert:          2.48 ms (Threshold: < 50ms)
- Send + Toast Await:      234.53 ms (Threshold: < 600ms)
------------------------------------------------------------
- TOTAL PIPELINE LATENCY:  288.57 ms (Sub-second execution)
============================================================
```

> **Speedup Ratio**: Fast CDP injection populates a full 1,000-word body in **12ms** compared to **1,094ms** with legacy character-by-character typing (>90x faster).

---

## 🛠️ Complete Semantic Tools Suite (27 Gmail Tools)

`gmail-browser-mcp` implements every major feature a human user can perform in Gmail, grouped into 6 functional categories:

### 1. Outbound & Composing
- **`send_email`**: Dispatches an email with subject, body, optional CC/BCC, and local attachments (<25MB).
- **`reply_email`**: Replies to an existing thread with optional `reply_all: true` and attachments.
- **`forward_email`**: Forwards an email thread to new recipients with an optional custom message.

### 2. Drafts Management
- **`save_draft`**: Saves a draft in Gmail without sending, capturing recipient, subject, body, and attachments.
- **`list_drafts`**: Lists all pending, unsent drafts with subjects, snippets, and timestamps.
- **`delete_draft`**: Discards and deletes an email draft.

### 3. Search & Inspection
- **`search_emails`**: Searches messages with full Gmail query syntax (`is:unread`, `from:`, `has:attachment`) with safe limit clamping.
- **`read_email`**: Inspects full conversation thread details, extracting senders, timestamps, body text, and attachments.

### 4. Mailbox Organization & Triage
- **`archive_email`**: Archives a conversation, removing it from Inbox.
- **`move_to_inbox`**: Restores an archived conversation back to the primary Inbox.
- **`delete_email`**: Moves a conversation thread to Trash.
- **`empty_trash`**: Permanently empties all deleted emails in the Trash folder.
- **`mark_as_read`**: Marks an email thread as read.
- **`mark_as_unread`**: Marks an email thread as unread.
- **`star_email`**: Stars a thread for high-priority visibility.
- **`unstar_email`**: Removes the star flag from a thread.
- **`mark_as_spam`**: Reports an email thread as spam.
- **`unmark_as_spam`**: Clears spam status and restores conversation to inbox.

### 5. Labels & Custom Taxonomy
- **`list_labels`**: Lists all system folders and user-created custom labels.
- **`create_label`**: Creates a new user label in Gmail.
- **`delete_label`**: Deletes an existing custom label.
- **`add_label`**: Applies a label to an email thread.
- **`remove_label`**: Removes a label from an email thread.

### 6. Advanced Productivity & Diagnostics
- **`snooze_email`**: Snoozes a thread until a specified preset (e.g. "Tomorrow", "Next week").
- **`download_attachment`**: Downloads an email attachment to a local folder (defaults to `~/Downloads`).
- **`get_inbox_stats`**: Retrieves real-time unread counts across Primary, Promotions, Social, Updates, Spam, and Trash.
- **`check_session`**: Verifies cookie authentication state and active account index routing without altering data.

---

## 🔒 Security Architecture & Guardrails

1. **System Chrome Binary & Stealth**:
   - Launches host Google Chrome with `--disable-blink-features=AutomationControlled` to evade automated bot detection.
2. **Fail-Fast Circuit Breakers**:
   - Immediate interception of Google 2FA/Security checkpoints (`/signin/v2/challenge`, `/rejected`, `google.com/sorry`).
   - Halts execution cleanly with diagnostic `GmailSafetyError` without triggering risky automated retries.
3. **Pacing Queue & Serialized Mutex**:
   - Prevents UI race conditions by enforcing a serialized execution queue.
4. **Attachment Safety Boundaries**:
   - Strict validation preventing attachments larger than Gmail's 25MB boundary or 0-byte corrupt files.
5. **Zero Token Leaks**:
   - Stdio transport logs exclusively to `stderr`, keeping JSON-RPC communication on `stdout` clean and uncorrupted.

---

## 📦 Quickstart

### 1. Prerequisites
- **Node.js**: v20+ or v24+
- **Google Chrome**: Installed on the host system (macOS, Linux, or Windows)
- **Session Cookies**: Exported from an active Gmail session

### 2. Installation
```bash
git clone https://github.com/sparsh101sparsh/gmail-browser-mcp.git
cd gmail-browser-mcp
npm install
npm run build
```

### 3. Session Cookie Setup
1. Log in to Gmail in your regular desktop Chrome browser (`https://mail.google.com/`).
2. Export cookies for `mail.google.com` using a standard cookie export extension (e.g., *Cookie-Editor*).
3. Save the JSON file to:
   ```bash
   ~/Downloads/mail.google.com_cookies.json
   ```
4. Set secure permissions:
   ```bash
   chmod 600 ~/Downloads/mail.google.com_cookies.json
   ```

*(Optional)* Specify a custom cookie path in `.env` or set `GMAIL_COOKIES_PATH`:
```bash
export GMAIL_COOKIES_PATH="/path/to/mail.google.com_cookies.json"
```

### 4. Running the Test Suites
```bash
npm test
```
Runs 93 comprehensive tests covering:
- Unit tests (cookies, rate limiter, attachments, guardrails)
- Sub-second speed benchmark assertions
- Stdio MCP protocol discovery for all 27 tools
- Empirical challenger and adversarial stress harnesses

---

## ⚙️ MCP Client Configuration

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "gmail": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/gmail-browser-mcp/dist/index.js"],
      "env": {
        "GMAIL_COOKIES_PATH": "/Users/USERNAME/Downloads/mail.google.com_cookies.json",
        "GMAIL_HEADLESS": "true"
      }
    }
  }
}
```

### Antigravity / Cursor / Claude Code
```json
{
  "gmail-browser-mcp": {
    "command": "node",
    "args": ["dist/index.js"],
    "env": {
      "GMAIL_COOKIES_PATH": "./mail.google.com_cookies.json",
      "GMAIL_HEADLESS": "true"
    }
  }
}
```

---

## 📊 Market Research & Analysis

For the complete competitive landscape evaluation, economic breakdown of CASA audit elimination, and token efficiency analysis, see:
👉 **[impact result.md](./impact%20result.md)**

---

## 🖼️ Visual Verification Evidence

All automated operations are visually verified via Playwright screenshots stored under [`docs/assets/`](./docs/assets/):
- **Live Dispatch Confirmation**: [`docs/assets/confirmation_result.png`](./docs/assets/confirmation_result.png)
- **Modal Compose Trigger**: [`docs/assets/modal_compose_opened.png`](./docs/assets/modal_compose_opened.png)
- **Direct Compose View**: [`docs/assets/direct_compose_loaded.png`](./docs/assets/direct_compose_loaded.png)

---

## 📄 License

MIT © [sparsh101sparsh](https://github.com/sparsh101sparsh)
