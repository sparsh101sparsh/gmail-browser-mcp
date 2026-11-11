import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { checkPageSafety, GmailSafetyError } from "../dist/browser/guardrails.js";
import {
  normalizeCookies,
  validateCookies,
  detectAccountIndex,
  loadCookies,
} from "../dist/utils/cookies.js";

// =========================================================================
// SECTION 1: GUARDRAIL & CHALLENGE INTERCEPTION VERIFICATION
// =========================================================================

describe("CHALLENGER 2: Guardrail & Challenge Interception Logic", () => {
  const challengeUrls = [
    // Standard Google Challenge endpoints
    "https://accounts.google.com/signin/v2/challenge",
    "https://accounts.google.com/signin/v2/challenge/pwd",
    "https://accounts.google.com/signin/v2/challenge/pwd?tl=AK2x6b...",
    "https://accounts.google.com/signin/v2/challenge/selection",
    "https://accounts.google.com/signin/v2/challenge/totp",
    "https://accounts.google.com/signin/v2/challenge/ipp",
    "https://accounts.google.com/signin/challenge",
    "https://accounts.google.com/signin/challenge/pwd",
    "https://accounts.google.com/challenge/speedbump",
    "https://mail.google.com/challenge/verify",
  ];

  for (const url of challengeUrls) {
    test(`triggers SECURITY_CHALLENGE for URL: ${url}`, async () => {
      const mockPage = {
        url: () => url,
        evaluate: async () => "",
        $: async () => null,
      };

      await assert.rejects(
        async () => checkPageSafety(mockPage),
        (err) => {
          assert.ok(err instanceof GmailSafetyError, `Expected GmailSafetyError for ${url}`);
          assert.equal(err.code, "SECURITY_CHALLENGE");
          assert.equal(err.url, url);
          return true;
        }
      );
    });
  }

  const rejectedUrls = [
    "https://accounts.google.com/rejected",
    "https://accounts.google.com/rejected?continue=https://mail.google.com",
    "https://accounts.google.com/signin/rejected",
    "https://accounts.google.com/signin/rejected?flowName=GlifWebSignIn",
  ];

  for (const url of rejectedUrls) {
    test(`triggers AUTOMATION_REJECTED for URL: ${url}`, async () => {
      const mockPage = {
        url: () => url,
        evaluate: async () => "",
        $: async () => null,
      };

      await assert.rejects(
        async () => checkPageSafety(mockPage),
        (err) => {
          assert.ok(err instanceof GmailSafetyError, `Expected GmailSafetyError for ${url}`);
          assert.equal(err.code, "AUTOMATION_REJECTED");
          assert.equal(err.url, url);
          return true;
        }
      );
    });
  }

  const disabledUrls = [
    "https://accounts.google.com/AccountDisabled",
    "https://accounts.google.com/AccountDisabled?continue=https://mail.google.com",
    "https://accounts.google.com/account/disabled",
  ];

  for (const url of disabledUrls) {
    test(`triggers ACCOUNT_DISABLED for URL: ${url}`, async () => {
      const mockPage = {
        url: () => url,
        evaluate: async () => "",
        $: async () => null,
      };

      await assert.rejects(
        async () => checkPageSafety(mockPage),
        (err) => {
          assert.ok(err instanceof GmailSafetyError, `Expected GmailSafetyError for ${url}`);
          assert.equal(err.code, "ACCOUNT_DISABLED");
          assert.equal(err.url, url);
          return true;
        }
      );
    });
  }

  const unauthUrls = [
    "https://accounts.google.com/v3/signin",
    "https://accounts.google.com/v3/signin/identifier",
    "https://accounts.google.com/ServiceLogin?service=mail",
    "https://accounts.google.com/signin/v2/identifier",
    "https://accounts.google.com/signin/identifier",
  ];

  for (const url of unauthUrls) {
    test(`triggers UNAUTHENTICATED_SESSION for URL: ${url}`, async () => {
      const mockPage = {
        url: () => url,
        evaluate: async () => "",
        $: async () => null,
      };

      await assert.rejects(
        async () => checkPageSafety(mockPage),
        (err) => {
          assert.ok(err instanceof GmailSafetyError, `Expected GmailSafetyError for ${url}`);
          assert.equal(err.code, "UNAUTHENTICATED_SESSION");
          assert.equal(err.url, url);
          return true;
        }
      );
    });
  }

  const domTextPatterns = [
    {
      name: "automation rejection text standard",
      text: "This browser or app may not be secure. Learn more.",
      expectedCode: "AUTOMATION_REJECTED",
    },
    {
      name: "automation rejection text uppercase",
      text: "THIS BROWSER OR APP MAY NOT BE SECURE. PLEASE USE A SUPPORTED BROWSER.",
      expectedCode: "AUTOMATION_REJECTED",
    },
    {
      name: "verify identity straight apostrophe",
      text: "Please verify it's you by entering the code sent to your device.",
      expectedCode: "SECURITY_CHALLENGE",
    },
    {
      name: "verify identity curly apostrophe",
      text: "Please verify it’s you to access your Gmail inbox.",
      expectedCode: "SECURITY_CHALLENGE",
    },
    {
      name: "confirm your phone checkpoint",
      text: "Confirm your phone number to continue signing in.",
      expectedCode: "SECURITY_CHALLENGE",
    },
    {
      name: "account disabled notice in DOM",
      text: "Your account has been disabled due to suspicious activity.",
      expectedCode: "ACCOUNT_DISABLED",
    },
    {
      name: "unusual traffic / network challenge text",
      text: "Our systems have detected unusual traffic from your computer network.",
      expectedCode: "SECURITY_CHALLENGE",
    },
    {
      name: "unusual traffic uppercase variation",
      text: "UNUSUAL TRAFFIC FROM YOUR COMPUTER NETWORK. THIS PAGE CHECKS TO SEE IF IT'S REALLY YOU.",
      expectedCode: "SECURITY_CHALLENGE",
    },
  ];

  for (const pattern of domTextPatterns) {
    test(`triggers ${pattern.expectedCode} for DOM text: ${pattern.name}`, async () => {
      const mockPage = {
        url: () => "https://mail.google.com/mail/u/1/#inbox",
        evaluate: async () => pattern.text,
        $: async () => null,
      };

      await assert.rejects(
        async () => checkPageSafety(mockPage),
        (err) => {
          assert.ok(err instanceof GmailSafetyError);
          assert.equal(err.code, pattern.expectedCode);
          return true;
        }
      );
    });
  }

  const captchaSelectors = [
    "iframe[src*='recaptcha']",
    "div#recaptcha",
    "div.g-recaptcha",
    "iframe[title*='reCAPTCHA' i]",
  ];

  for (const selector of captchaSelectors) {
    test(`triggers CAPTCHA_CHALLENGE when matching selector ${selector}`, async () => {
      const mockPage = {
        url: () => "https://mail.google.com/mail/u/1/#inbox",
        evaluate: async () => "Loading your Gmail experience...",
        $: async (query) => {
          if (query.includes(selector.replace("iframe[title*='reCAPTCHA' i]", "reCAPTCHA"))) {
            return { asElement: () => ({}) };
          }
          return null;
        },
      };

      await assert.rejects(
        async () => checkPageSafety(mockPage),
        (err) => {
          assert.ok(err instanceof GmailSafetyError);
          assert.equal(err.code, "CAPTCHA_CHALLENGE");
          return true;
        }
      );
    });
  }

  test("resilience: handles evaluate execution context error gracefully without throwing false alarm", async () => {
    const mockPage = {
      url: () => "https://mail.google.com/mail/u/1/#inbox",
      evaluate: async () => {
        throw new Error("Execution context was destroyed, most likely because of a navigation.");
      },
      $: async () => null,
    };

    // Should not throw GmailSafetyError or unhandled exception
    await assert.doesNotReject(async () => checkPageSafety(mockPage));
  });

  test("resilience: handles selector query error gracefully", async () => {
    const mockPage = {
      url: () => "https://mail.google.com/mail/u/1/#inbox",
      evaluate: async () => "Normal inbox text",
      $: async () => {
        throw new Error("Target page, context or browser has been closed");
      },
    };

    await assert.doesNotReject(async () => checkPageSafety(mockPage));
  });

  test("clean page: does not trigger on normal Gmail inbox DOM text and URL", async () => {
    const mockPage = {
      url: () => "https://mail.google.com/mail/u/1/#inbox",
      evaluate: async () => "Primary Social Promotions Updates Forums Starred Sent Drafts",
      $: async () => null,
    };

    await assert.doesNotReject(async () => checkPageSafety(mockPage));
  });
});

// =========================================================================
// SECTION 2: REAL USER COOKIES VERIFICATION & ACCOUNT INDEX DETECTION
// =========================================================================

describe("CHALLENGER 2: Real User Cookies & Normalization", () => {
  const cookieFilePath = "/Users/iamsparsh00321/Downloads/mail.google.com_cookies.json";

  test("real cookies file exists and is readable JSON", () => {
    assert.ok(fs.existsSync(cookieFilePath), `Cookie file must exist at ${cookieFilePath}`);
    const stats = fs.statSync(cookieFilePath);
    assert.ok(stats.size > 1000, `Cookie file size should be substantial (actual: ${stats.size} bytes)`);

    const raw = JSON.parse(fs.readFileSync(cookieFilePath, "utf-8"));
    assert.ok(Array.isArray(raw), "Cookie file content must be a JSON array");
    assert.ok(raw.length >= 20, `Expected at least 20 cookies, found ${raw.length}`);
  });

  test("normalizes real cookies: SameSite=no_restriction -> None, sets secure=true, integer timestamps", () => {
    const raw = JSON.parse(fs.readFileSync(cookieFilePath, "utf-8"));
    const normalized = normalizeCookies(raw);

    assert.equal(normalized.length, raw.length, "All valid cookies should be retained");

    for (const c of normalized) {
      assert.ok(c.name && typeof c.name === "string" && c.name.length > 0, "Cookie name must be valid");
      assert.ok(c.value !== undefined && typeof c.value === "string", "Cookie value must be string");
      assert.ok(c.domain.endsWith("google.com"), `Domain should be a google domain: ${c.domain}`);
      assert.ok(typeof c.httpOnly === "boolean", "httpOnly must be boolean");
      assert.ok(typeof c.secure === "boolean", "secure must be boolean");

      if (c.sameSite === "None") {
        assert.equal(c.secure, true, `SameSite=None cookie ${c.name} MUST have secure=true`);
      }

      if (c.expires !== undefined) {
        assert.ok(Number.isInteger(c.expires), `Expires must be an integer: ${c.expires}`);
        assert.ok(c.expires < 1e11, `Expires must be in seconds, not milliseconds: ${c.expires}`);
      }
    }
  });

  test("detects account index 1 from real user cookies", () => {
    const raw = JSON.parse(fs.readFileSync(cookieFilePath, "utf-8"));
    const normalized = normalizeCookies(raw);

    // Verify presence of /mail/u/1 path among cookies
    const u1Cookies = normalized.filter((c) => c.path && c.path.includes("/mail/u/1"));
    assert.ok(u1Cookies.length > 0, "Real cookies must contain entries with path /mail/u/1");

    const index = detectAccountIndex(normalized);
    assert.equal(index, 1, `Auto-detected account index must be exactly 1, got ${index}`);
  });

  test("validates presence and freshness of mandatory auth tokens", () => {
    const session = loadCookies(cookieFilePath);
    assert.equal(session.accountIndex, 1);
    assert.ok(session.cookies.length > 0);

    const cookieNames = new Set(session.cookies.map((c) => c.name));
    assert.ok(cookieNames.has("SID"), "Must contain SID");
    assert.ok(cookieNames.has("HSID"), "Must contain HSID");
    assert.ok(cookieNames.has("SSID"), "Must contain SSID");
    assert.ok(cookieNames.has("GMAIL_AT"), "Must contain GMAIL_AT");

    const validation = validateCookies(session.cookies);
    assert.equal(validation.missing.length, 0, `Missing required cookies: ${validation.missing.join(", ")}`);
    assert.equal(validation.expired.length, 0, `Expired cookies: ${validation.expired.join(", ")}`);
    assert.equal(validation.valid, true);
  });

  test("respects environment variable override GMAIL_ACCOUNT_INDEX", () => {
    const raw = JSON.parse(fs.readFileSync(cookieFilePath, "utf-8"));
    const normalized = normalizeCookies(raw);

    process.env.GMAIL_ACCOUNT_INDEX = "0";
    try {
      assert.equal(detectAccountIndex(normalized), 0);
    } finally {
      delete process.env.GMAIL_ACCOUNT_INDEX;
    }

    process.env.GMAIL_ACCOUNT_INDEX = "2";
    try {
      assert.equal(detectAccountIndex(normalized), 2);
    } finally {
      delete process.env.GMAIL_ACCOUNT_INDEX;
    }
  });
});

// =========================================================================
// SECTION 3: MCP SERVER BUILD & SPECIFICATION COMPLIANCE
// =========================================================================

describe("CHALLENGER 2: MCP Server Build & Protocol Specification Compliance", () => {
  test("dist/index.js exists and is executable", () => {
    const distPath = path.resolve("dist/index.js");
    assert.ok(fs.existsSync(distPath), "dist/index.js must exist after build");
    const stats = fs.statSync(distPath);
    const isExecutable = !!(stats.mode & 0o111);
    assert.ok(isExecutable, "dist/index.js must have executable permissions");
  });

  test("stdio JSON-RPC communication and full MCP tool schema compliance", async () => {
    const serverProcess = spawn("node", [path.resolve("dist/index.js")], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    const pendingResponses = new Map();

    serverProcess.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString("utf-8");
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.id !== undefined && pendingResponses.has(parsed.id)) {
            const cb = pendingResponses.get(parsed.id);
            pendingResponses.delete(parsed.id);
            cb(parsed);
          }
        } catch (e) {
          // ignore non-json line
        }
      }
    });

    const sendRequest = (method, params = {}) => {
      const id = Math.floor(Math.random() * 1000000);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingResponses.delete(id);
          reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
        }, 5000);

        pendingResponses.set(id, (res) => {
          clearTimeout(timeout);
          resolve(res);
        });

        const req = JSON.stringify({
          jsonrpc: "2.0",
          id,
          method,
          params,
        }) + "\n";
        serverProcess.stdin.write(req);
      });
    };

    try {
      // 1. Send initialize
      const initRes = await sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "challenger-test-client",
          version: "1.0.0",
        },
      });

      assert.ok(initRes.result, "Initialize response must contain result");
      assert.equal(initRes.result.serverInfo?.name, "gmail-browser-mcp");
      assert.equal(initRes.result.serverInfo?.version, "1.0.0");
      assert.ok(initRes.result.capabilities?.tools, "Capabilities must declare tools support");

      // 2. Send notifications/initialized
      serverProcess.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        }) + "\n"
      );

      // 3. Send tools/list
      const listRes = await sendRequest("tools/list", {});
      assert.ok(listRes.result, "tools/list response must contain result");
      const { tools } = listRes.result;
      assert.ok(Array.isArray(tools), "tools must be an array");

      const toolNames = tools.map((t) => t.name);
      assert.deepEqual(
        toolNames.sort(),
        ["check_session", "read_email", "search_emails", "send_email"].sort(),
        "Must declare exactly all 4 required Gmail tools"
      );

      // 4. Validate each tool against official MCP specification rules
      for (const tool of tools) {
        assert.ok(typeof tool.name === "string" && tool.name.length > 0, `Tool name must be string: ${tool.name}`);
        assert.ok(/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name), `Tool name must match MCP naming convention: ${tool.name}`);
        assert.ok(typeof tool.description === "string" && tool.description.length > 0, `Description must be present: ${tool.name}`);

        // Validate JSON Schema structure
        const schema = tool.inputSchema;
        assert.ok(schema && typeof schema === "object", `Tool ${tool.name} must have inputSchema object`);
        assert.equal(schema.type, "object", `Tool ${tool.name} schema.type must be 'object'`);
        assert.ok(schema.properties && typeof schema.properties === "object", `Tool ${tool.name} must have properties object`);

        if (schema.required) {
          assert.ok(Array.isArray(schema.required), `Tool ${tool.name} required must be array`);
          for (const req of schema.required) {
            assert.ok(typeof req === "string", `Required item must be string`);
            assert.ok(req in schema.properties, `Required property '${req}' must exist in properties of ${tool.name}`);
          }
        }

        // Validate each property
        for (const [propName, propDef] of Object.entries(schema.properties)) {
          assert.ok(
            ["string", "number", "boolean", "array", "object"].includes(propDef.type),
            `Property ${propName} in ${tool.name} has invalid type: ${propDef.type}`
          );
          assert.ok(typeof propDef.description === "string", `Property ${propName} in ${tool.name} must have description`);
          if (propDef.type === "array") {
            assert.ok(propDef.items && typeof propDef.items === "object", `Array property ${propName} must specify items`);
            assert.ok(typeof propDef.items.type === "string", `Array items in ${propName} must have type`);
          }
        }
      }

      // Detailed check on send_email schema
      const sendTool = tools.find((t) => t.name === "send_email");
      assert.deepEqual(sendTool.inputSchema.required, ["to", "subject", "body"]);
      assert.equal(sendTool.inputSchema.properties.to.type, "string");
      assert.equal(sendTool.inputSchema.properties.subject.type, "string");
      assert.equal(sendTool.inputSchema.properties.body.type, "string");
      assert.equal(sendTool.inputSchema.properties.attachment_paths.type, "array");
      assert.equal(sendTool.inputSchema.properties.attachment_paths.items.type, "string");

      // Detailed check on search_emails schema
      const searchTool = tools.find((t) => t.name === "search_emails");
      assert.deepEqual(searchTool.inputSchema.required, ["query"]);
      assert.equal(searchTool.inputSchema.properties.query.type, "string");
      assert.equal(searchTool.inputSchema.properties.limit.type, "number");

      // Detailed check on read_email schema
      const readTool = tools.find((t) => t.name === "read_email");
      assert.ok(readTool.inputSchema.properties.thread_id);

      // Detailed check on check_session schema
      const sessionTool = tools.find((t) => t.name === "check_session");
      assert.equal(sessionTool.inputSchema.type, "object");

      // 5. Test unknown tool call error response
      const unknownRes = await sendRequest("tools/call", {
        name: "non_existent_tool",
        arguments: {},
      });
      assert.ok(unknownRes.error || unknownRes.result?.isError, "Unknown tool call must return error");

      // 6. Test argument validation via tool execution
      const callInvalidSend = await sendRequest("tools/call", {
        name: "send_email",
        arguments: { to: "", subject: "Sub", body: "Body" },
      });
      assert.equal(callInvalidSend.result?.isError, true, "Should return isError: true on empty recipient");
      assert.ok(callInvalidSend.result?.content[0]?.text.includes("Recipient email address ('to') cannot be empty"));

    } finally {
      serverProcess.kill();
    }
  });
});
