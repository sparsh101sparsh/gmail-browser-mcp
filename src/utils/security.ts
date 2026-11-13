import type { SearchEmailsArgs } from "../types.js";

/**
 * Sanitizes incoming untrusted email bodies to defend against
 * indirect prompt injection attacks and invisible character steganography.
 */
export function sanitizeEmailBody(rawText?: string): string {
  if (!rawText || typeof rawText !== "string") {
    return "";
  }

  // 1. Strip invisible zero-width and control characters (steganographic injection defense)
  let clean = rawText
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u2060\u180E]/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  // 2. Scan for high-risk prompt injection override patterns
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
    /disregard\s+(all\s+)?(previous|prior)\s+instructions/i,
    /system\s+prompt\s*:/i,
    /<\/?system>/i,
    /you\s+are\s+now\s+in\s+developer\s+mode/i,
    /override\s+your\s+safety\s+guidelines/i,
  ];

  let hasInjectionAttempt = false;
  for (const pattern of injectionPatterns) {
    if (pattern.test(clean)) {
      hasInjectionAttempt = true;
      break;
    }
  }

  // 3. If suspicious instruction override vectors detected, neutralize by wrapping with warning tags
  if (hasInjectionAttempt) {
    console.error("[security] Potential untrusted instruction payload detected in incoming email body.");
    clean = `[UNTRUSTED_CONTENT_WARNING: The following email body contains text attempting system override instructions]\n<<<EMAIL_BODY_START>>>\n${clean}\n<<<EMAIL_BODY_END>>>`;
  }

  // 4. Bound length to 50,000 characters to prevent buffer bloat
  return clean.slice(0, 50000);
}

/**
 * Compiles structured search parameters into a normalized Gmail query string.
 * Example: { from: "alice@example.com", is_unread: true } => "from:alice@example.com is:unread"
 */
export function compileSearchQuery(args: SearchEmailsArgs): string {
  const parts: string[] = [];

  if (args.query && args.query.trim()) {
    parts.push(args.query.trim());
  }

  if (args.from && args.from.trim()) {
    parts.push(`from:${args.from.trim()}`);
  }

  if (args.to && args.to.trim()) {
    parts.push(`to:${args.to.trim()}`);
  }

  if (args.subject && args.subject.trim()) {
    parts.push(`subject:(${args.subject.trim()})`);
  }

  if (args.is_unread === true) {
    parts.push("is:unread");
  } else if (args.is_unread === false) {
    parts.push("is:read");
  }

  if (args.has_attachments === true) {
    parts.push("has:attachment");
  }

  if (args.after_date && args.after_date.trim()) {
    parts.push(`after:${args.after_date.trim()}`);
  }

  if (args.before_date && args.before_date.trim()) {
    parts.push(`before:${args.before_date.trim()}`);
  }

  if (args.label && args.label.trim()) {
    parts.push(`label:${args.label.trim()}`);
  }

  if (args.is_starred === true) {
    parts.push("is:starred");
  }

  if (args.larger_than && args.larger_than.trim()) {
    parts.push(`larger:${args.larger_than.trim()}`);
  }

  if (args.smaller_than && args.smaller_than.trim()) {
    parts.push(`smaller:${args.smaller_than.trim()}`);
  }

  if (args.filename && args.filename.trim()) {
    parts.push(`filename:${args.filename.trim()}`);
  }

  if (args.in_folder && args.in_folder.trim()) {
    parts.push(`in:${args.in_folder.trim()}`);
  }

  const compiled = parts.join(" ").trim();
  if (!compiled) {
    throw new Error(
      "Search query cannot be empty. Must provide at least 'query', 'from', 'to', 'subject', or a filter."
    );
  }

  return compiled;
}
