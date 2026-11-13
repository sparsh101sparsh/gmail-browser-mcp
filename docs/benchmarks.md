# Performance Benchmarks: Gmail Browser MCP

This document records empirical latency measurements and execution profiles across transport mechanisms and browser interaction strategies.

---

## 1. Transport Latency Comparison

| Transport Method | Cold Start | Warm In-Memory | Overhead | Best For |
| :--- | :--- | :--- | :--- | :--- |
| **Unix Domain Socket (`AF_UNIX`)** | N/A | **< 150 ms** | ~0.8 ms | Real-time CLI, Tool Calls |
| **MCP Stdio (Direct Process)** | ~4,500 ms | **< 800 ms** | ~12 ms | IDE MCP Plugins, Claude Desktop |
| **Ephemeral Chromium (Legacy)** | ~18,000 ms | N/A | High | Cookie-only environments |

---

## 2. In-Tab Compose Pipeline Latency

Measurements captured using atomic CDP injection (`Input.insertText`) vs legacy keyboard emulation:

| Action Stage | Atomic CDP Method | Legacy Keystroke Typing | Speedup Factor |
| :--- | :--- | :--- | :--- |
| **Modal Compose Trigger** | `111 ms` | `320 ms` | **2.9x faster** |
| **Recipient (To) Tokenizer** | `14 ms` | `180 ms` | **12.8x faster** |
| **Subject Box Fill** | `2.3 ms` | `75 ms` | **32.6x faster** |
| **Body Text Injection** | `4.5 ms` | `1,038 ms` | **230x faster** |
| **Send + Toast Confirmation**| `201 ms` | `450 ms` | **2.2x faster** |
| **TOTAL SEND PIPELINE** | **332 ms** | **2,063 ms** | **6.2x faster** |

---

## 3. Pacing & Rate Limiting Enforcement

To maintain session stability and respect Gmail rate limits:
- **Search clamp**: Automatically capped to a maximum of 30 results per page.
- **Pacing interval**: 100ms minimum inter-keystroke spacing on input fallback.
- **Circuit breaker**: Zero-latency halt on Google security checkpoints (`/challenge/`, `/sorry/index`).
