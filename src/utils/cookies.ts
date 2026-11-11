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
  const p =
    process.env.GMAIL_COOKIES_PATH ||
    path.join(os.homedir(), "Downloads", "mail.google.com_cookies.json");
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
      // Ensure google domains are clean
      if (domain === "google.com") {
        domain = ".google.com";
      }

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
          if (!isNaN(parsed)) {
            expNum = Math.floor(parsed / 1000);
          }
        }
        if (!isNaN(expNum) && isFinite(expNum)) {
          // If timestamp is in milliseconds (> 100 billion), convert to seconds
          if (expNum > 1e11) {
            expNum = Math.floor(expNum / 1000);
          } else {
            expNum = Math.round(expNum);
          }
          cookie.expires = expNum;
        }
      }

      if (c.sameSite && typeof c.sameSite === "string") {
        const s = c.sameSite.toLowerCase();
        if (s === "no_restriction" || s === "none") {
          cookie.sameSite = "None";
          cookie.secure = true; // SameSite=None requires Secure per cookie spec
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

  // Check cookie paths for /mail/u/{index} pattern (especially GMAIL_AT and COMPASS)
  for (const c of cookies) {
    if (c.path) {
      const match = c.path.match(/\/mail\/u\/(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  }

  // Default to 1 based on user's active session profile
  return 1;
}

export interface CookieValidationResult {
  valid: boolean;
  missing: string[];
  expired: string[];
}

export function validateCookies(cookies: PlaywrightCookie[]): CookieValidationResult {
  const nowSec = Date.now() / 1000;
  const cookieMap = new Map(cookies.map((c) => [c.name, c]));
  const required = ["SID", "HSID", "SSID", "GMAIL_AT"];
  const missing = required.filter((name) => !cookieMap.has(name));
  const expired: string[] = [];

  for (const name of required) {
    const c = cookieMap.get(name);
    if (c && c.expires !== undefined && c.expires < nowSec) {
      expired.push(name);
    }
  }

  return {
    valid: missing.length === 0 && expired.length === 0,
    missing,
    expired,
  };
}

export interface LoadedCookiesSession {
  cookies: PlaywrightCookie[];
  accountIndex: number;
}

export function loadCookies(customPath?: string): LoadedCookiesSession {
  const targetPath = expandHome(customPath || getDefaultCookiePath());

  if (!fs.existsSync(targetPath)) {
    throw new Error(
      `Gmail cookies file not found at: ${targetPath}. Please provide cookies exported from a logged-in Gmail session.`
    );
  }

  let content: string;
  try {
    content = fs.readFileSync(targetPath, "utf-8");
  } catch (err: any) {
    throw new Error(`Failed to read cookies file at ${targetPath}: ${err.message}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (err: any) {
    throw new Error(`Failed to parse cookies JSON from ${targetPath}: ${err.message}`);
  }

  const normalized = normalizeCookies(parsed);
  const accountIndex = detectAccountIndex(normalized);
  const validation = validateCookies(normalized);

  if (!validation.valid) {
    const problems: string[] = [];
    if (validation.missing.length > 0) {
      problems.push(`missing required auth cookies (${validation.missing.join(", ")})`);
    }
    if (validation.expired.length > 0) {
      problems.push(`expired auth cookies (${validation.expired.join(", ")})`);
    }
    console.error(`[warning] Gmail cookies validation issue: ${problems.join(", ")}`);
    if (validation.missing.includes("SID") || validation.expired.includes("SID")) {
      throw new Error(
        `Critical Google auth cookie 'SID' is ${
          validation.missing.includes("SID") ? "missing" : "expired"
        }. Please re-export cookies from a logged-in Gmail session.`
      );
    }
    if (validation.missing.includes("GMAIL_AT") || validation.expired.includes("GMAIL_AT")) {
      throw new Error(
        validation.missing.includes("GMAIL_AT")
          ? "Critical Gmail action token 'GMAIL_AT' is missing. Please ensure you export cookies from https://mail.google.com/ while logged in."
          : "Critical Gmail action token 'GMAIL_AT' is expired. Please re-export cookies from an active Gmail session."
      );
    }
    if (validation.missing.includes("HSID") || validation.expired.includes("HSID")) {
      throw new Error(
        `Critical Google auth cookie 'HSID' is ${
          validation.missing.includes("HSID") ? "missing" : "expired"
        }. Please re-export cookies from a logged-in Gmail session.`
      );
    }
    if (validation.missing.includes("SSID") || validation.expired.includes("SSID")) {
      throw new Error(
        `Critical Google auth cookie 'SSID' is ${
          validation.missing.includes("SSID") ? "missing" : "expired"
        }. Please re-export cookies from a logged-in Gmail session.`
      );
    }
  }

  return {
    cookies: normalized,
    accountIndex,
  };
}
