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

export function normalizeCookies(rawCookies: any[]): PlaywrightCookie[] {
  if (!Array.isArray(rawCookies)) {
    throw new Error("Cookies file must contain a JSON array of cookie objects");
  }

  return rawCookies
    .filter(
      (c) =>
        c &&
        typeof c === "object" &&
        typeof c.name === "string" &&
        c.name.trim() !== "" &&
        typeof c.value === "string" &&
        c.value.trim() !== ""
    )
    .map((c) => {
      let domain = c.domain || ".google.com";
      if (domain === "google.com") domain = ".google.com";

      const cookie: PlaywrightCookie = {
        name: c.name.trim(),
        value: c.value,
        domain,
        path: c.path || "/",
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
      };

      const rawExp = c.expirationDate ?? c.expires ?? c.expiry;
      if (rawExp !== undefined && rawExp !== null && !c.session) {
        let expNum = Number(rawExp);
        if (isNaN(expNum) && typeof rawExp === "string") {
          const parsed = Date.parse(rawExp);
          if (!isNaN(parsed)) expNum = Math.floor(parsed / 1000);
        }
        if (!isNaN(expNum) && isFinite(expNum)) {
          if (expNum > 1e11) expNum = Math.floor(expNum / 1000);
          else expNum = Math.round(expNum);
          cookie.expires = expNum;
        }
      }

      if (c.sameSite && typeof c.sameSite === "string") {
        const s = c.sameSite.toLowerCase();
        if (s === "no_restriction" || s === "none") {
          cookie.sameSite = "None";
          cookie.secure = true;
        } else if (s === "lax") {
          cookie.sameSite = "Lax";
        } else if (s === "strict") {
          cookie.sameSite = "Strict";
        }
      }

      return cookie;
    });
}

export function detectAccountIndex(cookies: PlaywrightCookie[]): number {
  if (process.env.GMAIL_ACCOUNT_INDEX) {
    const parsed = parseInt(process.env.GMAIL_ACCOUNT_INDEX, 10);
    if (!isNaN(parsed)) return parsed;
  }

  for (const c of cookies) {
    if (c.path) {
      const match = c.path.match(/\/mail\/u\/(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
  }

  return 0;
}
