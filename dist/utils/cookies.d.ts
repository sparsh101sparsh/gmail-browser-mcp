import type { PlaywrightCookie } from "../types.js";
export declare function expandHome(filepath: string): string;
export declare function getDefaultCookiePath(): string;
export declare function normalizeCookies(rawCookies: any[]): PlaywrightCookie[];
export declare function detectAccountIndex(cookies: PlaywrightCookie[]): number;
export interface CookieValidationResult {
    valid: boolean;
    missing: string[];
    expired: string[];
}
export declare function validateCookies(cookies: PlaywrightCookie[]): CookieValidationResult;
export interface LoadedCookiesSession {
    cookies: PlaywrightCookie[];
    accountIndex: number;
}
export declare function loadCookies(customPath?: string): LoadedCookiesSession;
