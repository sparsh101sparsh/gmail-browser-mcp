import type { SearchEmailsArgs } from "../types.js";
/**
 * Sanitizes incoming untrusted email bodies to defend against
 * indirect prompt injection attacks and invisible character steganography.
 */
export declare function sanitizeEmailBody(rawText?: string): string;
/**
 * Compiles structured search parameters into a normalized Gmail query string.
 * Example: { from: "alice@example.com", is_unread: true } => "from:alice@example.com is:unread"
 */
export declare function compileSearchQuery(args: SearchEmailsArgs): string;
