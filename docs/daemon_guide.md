# Gmail MCP Daemon & CLI Quickstart Guide

This guide explains how to operate the high-speed background daemon and zero-dependency Python client with your persistent profile.

---

## 1. Quickstart (Sub-Second Fast Client)

The CLI tool `scripts/fast_mail.py` communicates directly with the warm background daemon over `/tmp/gmail_mcp.sock`:

### Send Email
```bash
python3 scripts/fast_mail.py send \
  --to "recipient@example.com" \
  --subject "Project Status" \
  --body "All test suites passing in sub-second time."
```

### Search Inbox
```bash
python3 scripts/fast_mail.py search --query "is:unread" --limit 5
```

### Read Specific Thread
```bash
python3 scripts/fast_mail.py read --thread-id "192fd381ab92"
```

### Inspect Inbox Stats
```bash
python3 scripts/fast_mail.py stats
```

---

## 2. Managing the Background Daemon

| Command | Action |
| :--- | :--- |
| `python3 scripts/fast_mail.py daemon start` | Launches warm daemon in background |
| `python3 scripts/fast_mail.py daemon status` | Verifies `/tmp/gmail_mcp.sock` connection |
| `python3 scripts/fast_mail.py daemon stop` | Gracefully shuts down daemon & releases memory |
| `python3 scripts/fast_mail.py metrics` | Inspects live RAM usage, uptime, and request counts |
| `python3 scripts/fast_mail.py doctor` | Runs end-to-end self-diagnostic system check |

---

## 3. Persistent Profile Configuration

The engine uses `~/.gmail-mcp-profile` by default. You can customize the profile directory via environment variables:

```bash
export GMAIL_PROFILE_DIR="/custom/path/to/profile"
export GMAIL_USE_PROFILE="true"
```
