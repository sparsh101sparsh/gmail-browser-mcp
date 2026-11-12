#!/usr/bin/env python3
"""
High-Speed Gmail Fast Client (scripts/fast_mail.py)
--------------------------------------------------
Zero-dependency Python CLI client for ultra-fast Gmail operations.
Communicates via high-speed Unix Domain Socket (/tmp/gmail_mcp.sock)
or direct MCP Stdio JSON-RPC.

Usage:
  python3 scripts/fast_mail.py send --to "user@example.com" --subject "Urgent" --body "Hello"
  python3 scripts/fast_mail.py search --query "is:unread" --limit 5
  python3 scripts/fast_mail.py read --thread-id "<id>"
  python3 scripts/fast_mail.py stats
  python3 scripts/fast_mail.py check
  python3 scripts/fast_mail.py login
  python3 scripts/fast_mail.py daemon [start|stop|status]
"""

import sys
import os
import json
import time
import socket
import argparse
import subprocess
from pathlib import Path

SOCKET_PATH = os.environ.get("GMAIL_SOCKET_PATH", "/tmp/gmail_mcp.sock")
REPO_ROOT = Path(__file__).resolve().parent.parent

# ANSI Color codes for clean terminal output
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def is_socket_active() -> bool:
    """Checks if the Unix Domain Socket daemon is currently running and accepting connections."""
    if not os.path.exists(SOCKET_PATH):
        return False
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            s.connect(SOCKET_PATH)
            s.sendall(b'{"action":"ping"}\n')
            data = s.recv(1024)
            res = json.loads(data.decode("utf-8").strip())
            return res.get("status") == "success" and res.get("data", {}).get("pong") is True
    except Exception:
        return False


def send_via_socket(action: str, args: dict) -> dict:
    """Sends action request to background daemon over Unix Domain Socket."""
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
        s.settimeout(30.0)
        s.connect(SOCKET_PATH)
        payload = json.dumps({"action": action, "args": args}) + "\n"
        s.sendall(payload.encode("utf-8"))

        buffer = ""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            buffer += chunk.decode("utf-8")
            if "\n" in buffer:
                break

        line = buffer.strip().split("\n")[0]
        return json.loads(line)


def send_via_stdio(tool_name: str, arguments: dict) -> dict:
    """Fallback: Executes tool via direct stdio JSON-RPC subprocess."""
    dist_index = REPO_ROOT / "dist" / "index.js"
    if not dist_index.exists():
        subprocess.run(["npm", "run", "build"], cwd=REPO_ROOT, check=True)

    env = os.environ.copy()
    if "GMAIL_USE_PROFILE" not in env:
        env["GMAIL_USE_PROFILE"] = "true"

    proc = subprocess.Popen(
        ["node", str(dist_index)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=REPO_ROOT,
        env=env,
    )

    # 1. Initialize
    init_req = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "fast_mail_py", "version": "1.0.0"},
        },
    }
    proc.stdin.write(json.dumps(init_req) + "\n")
    proc.stdin.flush()
    proc.stdout.readline()

    # 2. Call Tool
    call_req = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": arguments},
    }
    proc.stdin.write(json.dumps(call_req) + "\n")
    proc.stdin.flush()

    raw_resp = proc.stdout.readline()
    proc.terminate()

    resp = json.loads(raw_resp.strip())
    if "result" in resp:
        result_data = resp["result"]
        if result_data.get("isError"):
            return {"status": "error", "error": result_data.get("content", [{}])[0].get("text", "")}
        try:
            parsed = json.loads(result_data.get("content", [{}])[0].get("text", "{}"))
            return {"status": "success", "data": parsed}
        except Exception:
            return {"status": "success", "data": result_data}
    elif "error" in resp:
        return {"status": "error", "error": resp["error"].get("message", "")}

    return {"status": "error", "error": "Unknown stdio response"}


def dispatch(action: str, args: dict):
    """Dispatches request via fastest available transport."""
    start_time = time.perf_counter()
    if is_socket_active():
        transport = f"{CYAN}Warm Unix Socket Daemon (Sub-second){RESET}"
        res = send_via_socket(action, args)
    else:
        transport = f"{YELLOW}Direct Stdio Process (Cold){RESET}"
        res = send_via_stdio(action, args)

    elapsed_ms = (time.perf_counter() - start_time) * 1000.0

    print(f"\n{BOLD}Transport:{RESET} {transport}")
    print(f"{BOLD}Total Client Latency:{RESET} {GREEN}{elapsed_ms:.2f} ms{RESET}")

    if res.get("status") == "success":
        print(f"{GREEN}{BOLD}STATUS: SUCCESS{RESET}")
        print(json.dumps(res.get("data", {}), indent=2))
    else:
        print(f"{RED}{BOLD}STATUS: ERROR ({res.get('code', 'FAIL')}){RESET}")
        print(f"{RED}{res.get('error')}{RESET}")
        sys.exit(1)


def cmd_send(args):
    payload = {
        "to": args.to,
        "subject": args.subject,
        "body": args.body,
    }
    if args.html:
        payload["html"] = args.html
    if args.cc:
        payload["cc"] = args.cc
    if args.bcc:
        payload["bcc"] = args.bcc
    if args.attachment:
        payload["attachment_paths"] = args.attachment

    dispatch("send_email", payload)


def cmd_search(args):
    payload = {"limit": args.limit}
    if args.query:
        payload["query"] = args.query
    if args.sender:
        payload["from"] = args.sender
    if args.to:
        payload["to"] = args.to
    if args.subject:
        payload["subject"] = args.subject
    if args.unread:
        payload["is_unread"] = True

    dispatch("search_emails", payload)


def cmd_read(args):
    payload = {}
    if args.thread_id:
        payload["thread_id"] = args.thread_id
    if args.query:
        payload["search_query"] = args.query

    dispatch("read_email", payload)


def cmd_stats(args):
    dispatch("get_inbox_stats", {})


def cmd_check(args):
    dispatch("check_session", {})


def cmd_login(args):
    """Launches interactive profile login helper."""
    setup_script = REPO_ROOT / "scripts" / "setup_profile.js"
    print(f"{CYAN}Launching Google Chrome Interactive Profile Setup...{RESET}")
    subprocess.run(["node", str(setup_script)], cwd=REPO_ROOT)


def cmd_daemon(args):
    action = args.subaction
    daemon_script = REPO_ROOT / "scripts" / "daemon.js"

    if action == "status":
        if is_socket_active():
            print(f"{GREEN}Gmail Background Daemon is ACTIVE at {SOCKET_PATH}{RESET}")
        else:
            print(f"{YELLOW}Gmail Background Daemon is NOT running.{RESET}")
    elif action == "start":
        if is_socket_active():
            print(f"{YELLOW}Daemon is already running.{RESET}")
            return

        print(f"{CYAN}Starting Gmail Background Daemon in background...{RESET}")
        env = os.environ.copy()
        if "GMAIL_USE_PROFILE" not in env:
            env["GMAIL_USE_PROFILE"] = "true"

        proc = subprocess.Popen(
            ["node", str(daemon_script)],
            cwd=REPO_ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env,
            start_new_session=True,
        )
        print(f"Spawned daemon process (PID: {proc.pid})")
        time.sleep(1.5)
        if is_socket_active():
            print(f"{GREEN}Daemon started successfully and ready for sub-second requests!{RESET}")
        else:
            print(f"{RED}Daemon starting... Run 'status' to verify.{RESET}")

    elif action == "stop":
        if os.path.exists(SOCKET_PATH):
            try:
                os.unlink(SOCKET_PATH)
            except Exception:
                pass
        subprocess.run(["pkill", "-f", "scripts/daemon.js"])
        print(f"{GREEN}Daemon stopped.{RESET}")


def main():
    parser = argparse.ArgumentParser(
        description="High-Speed Gmail Fast Client (zero-dependency Python CLI)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # 1. Send
    p_send = subparsers.add_parser("send", help="Send an outbound email")
    p_send.add_argument("--to", required=True, help="Recipient email address")
    p_send.add_argument("--subject", required=True, help="Email subject line")
    p_send.add_argument("--body", required=True, help="Email body content")
    p_send.add_argument("--html", help="Optional rich HTML body")
    p_send.add_argument("--cc", help="Optional CC recipient")
    p_send.add_argument("--bcc", help="Optional BCC recipient")
    p_send.add_argument("--attachment", action="append", help="Attachment file paths")
    p_send.set_defaults(func=cmd_send)

    # 2. Search
    p_search = subparsers.add_parser("search", help="Search inbox messages")
    p_search.add_argument("-q", "--query", help="Search query string")
    p_search.add_argument("--from", dest="sender", help="Filter by sender")
    p_search.add_argument("--to", help="Filter by recipient")
    p_search.add_argument("--subject", help="Filter by subject words")
    p_search.add_argument("--unread", action="store_true", help="Filter unread only")
    p_search.add_argument("-n", "--limit", type=int, default=10, help="Max results")
    p_search.set_defaults(func=cmd_search)

    # 3. Read
    p_read = subparsers.add_parser("read", help="Read an email thread")
    p_read.add_argument("-t", "--thread-id", help="Gmail thread ID")
    p_read.add_argument("-q", "--query", help="Search query to locate thread")
    p_read.set_defaults(func=cmd_read)

    # 4. Stats
    p_stats = subparsers.add_parser("stats", help="Get inbox unread metrics")
    p_stats.set_defaults(func=cmd_stats)

    # 5. Check
    p_check = subparsers.add_parser("check", help="Verify session health")
    p_check.set_defaults(func=cmd_check)

    # 6. Login
    p_login = subparsers.add_parser("login", help="Run 1-time visible browser profile login")
    p_login.set_defaults(func=cmd_login)

    # 7. Daemon
    p_daemon = subparsers.add_parser("daemon", help="Manage warm background daemon")
    p_daemon.add_argument("subaction", choices=["start", "stop", "status"], help="Daemon command")
    p_daemon.set_defaults(func=cmd_daemon)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
