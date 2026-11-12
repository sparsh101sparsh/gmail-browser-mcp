/**
 * Outgoing HTML Email Sanitizer
 * Strips active scripts, frames, dangerous embeds, and malicious event handlers
 * from outgoing HTML messages to guarantee zero client-side code execution.
 */
export interface SanitizeHtmlOptions {
    allowStyles?: boolean;
    maxBodyLength?: number;
}
export declare function sanitizeHtmlEmail(rawHtml: string, options?: SanitizeHtmlOptions): string;
