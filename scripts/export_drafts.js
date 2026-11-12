#!/usr/bin/env node

/**
 * Drafts Backup & Export CLI Utility
 * Exports all active drafts from Gmail to a timestamped local JSON file.
 */

import fs from "node:fs";
import path from "node:path";
import { defaultGmailService } from "../dist/services/gmail.js";
import { defaultSessionManager } from "../dist/browser/session.js";

async function main() {
  console.log(`[export_drafts] Fetching drafts from Gmail session...`);
  try {
    const drafts = await defaultGmailService.listDrafts({});
    console.log(`[export_drafts] Discovered ${drafts.length} drafts.`);

    const backupDir = path.resolve("backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputFile = path.join(backupDir, `drafts_${timestamp}.json`);

    fs.writeFileSync(
      outputFile,
      JSON.stringify(
        {
          exported_at: new Date().toISOString(),
          count: drafts.length,
          drafts,
        },
        null,
        2
      ),
      "utf-8"
    );

    console.log(`[export_drafts] Successfully exported ${drafts.length} drafts to: ${outputFile}`);
  } catch (err) {
    console.error(`[export_drafts] Failed to export drafts:`, err.message);
  } finally {
    await defaultSessionManager.close();
  }
}

main();
