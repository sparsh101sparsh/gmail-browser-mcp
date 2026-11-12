import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const scriptPath = path.resolve("scripts/fast_mail.py");

test("Python Fast Client CLI Test Suite", async (t) => {
  await t.test("displays help message with all supported subcommands", async () => {
    const { stdout } = await execFileAsync("python3", [scriptPath, "--help"]);
    assert.ok(stdout.includes("High-Speed Gmail Fast Client"));
    assert.ok(stdout.includes("send"));
    assert.ok(stdout.includes("search"));
    assert.ok(stdout.includes("read"));
    assert.ok(stdout.includes("stats"));
    assert.ok(stdout.includes("login"));
    assert.ok(stdout.includes("daemon"));
  });

  await t.test("reports daemon status accurately when idle", async () => {
    const { stdout } = await execFileAsync("python3", [scriptPath, "daemon", "status"]);
    assert.ok(stdout.includes("Gmail Background Daemon"));
  });

  await t.test("enforces required arguments on send command", async () => {
    try {
      await execFileAsync("python3", [scriptPath, "send"]);
      assert.fail("Should have thrown error for missing required arguments");
    } catch (err) {
      assert.ok(err.stderr.includes("the following arguments are required: --to, --subject, --body"));
    }
  });

  await t.test("enforces valid subcommand", async () => {
    try {
      await execFileAsync("python3", [scriptPath, "invalid_subcmd"]);
      assert.fail("Should have thrown for invalid command");
    } catch (err) {
      assert.ok(err.stderr.includes("invalid choice"));
    }
  });
});
