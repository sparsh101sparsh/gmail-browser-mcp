import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { PlaywrightCookie } from "../types.js";

export function expandHome(filepath: string): string {
  if (!filepath || typeof filepath !== "string") return filepath;
  if (filepath === "~") return os.homedir();
  if (filepath.startsWith("~/") || filepath.startsWith("~\\")) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
}

export function getDefaultCookiePath(): string {
  const p = process.env.GMAIL_COOKIES_PATH || path.join(os.homedir(), "Downloads", "mail.google.com_cookies.json");
  return expandHome(p);
}
