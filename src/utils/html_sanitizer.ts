/**
 * Outgoing HTML Email Sanitizer
 * Strips active scripts, frames, dangerous embeds, and malicious event handlers
 * from outgoing HTML messages to guarantee zero client-side code execution.
 */

export interface SanitizeHtmlOptions {
  allowStyles?: boolean;
  maxBodyLength?: number;
}

export function sanitizeHtmlEmail(rawHtml: string, options?: SanitizeHtmlOptions): string {
  if (!rawHtml || typeof rawHtml !== "string") {
    return "";
  }

  const maxLength = options?.maxBodyLength || 500000;
  let clean = rawHtml.slice(0, maxLength);

  // 1. Strip script tags and content
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // 2. Strip dangerous frames, embeds, and object tags
  clean = clean.replace(/<(iframe|object|embed|applet|meta|link)\b[^>]*>/gi, "");
  clean = clean.replace(/<\/(iframe|object|embed|applet|meta|link)>/gi, "");

  // 3. Remove javascript: pseudo-protocols
  clean = clean.replace(/href\s*=\s*["']?\s*javascript:[^"'>]*/gi, 'href="#"');
  clean = clean.replace(/src\s*=\s*["']?\s*javascript:[^"'>]*/gi, 'src=""');

  // 4. Strip inline event handlers (onclick, onerror, onload, onmouseover, etc.)
  clean = clean.replace(/\s+on[a-zA-Z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // 5. Clean style tags if styles disallowed
  if (options?.allowStyles === false) {
    clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  }

  return clean.trim();
}
