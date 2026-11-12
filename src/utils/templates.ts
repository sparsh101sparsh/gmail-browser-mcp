/**
 * Responsive HTML Email Template Builder
 * Converts structured markdown-like input into cross-client compatible HTML tables
 * and CSS styles supported by Gmail Web, Android, iOS, and Outlook.
 */

export interface EmailTemplateOptions {
  title?: string;
  preheader?: string;
  brandColor?: string;
  accentColor?: string;
  footerText?: string;
}

export function buildResponsiveEmailHtml(bodyText: string, options?: EmailTemplateOptions): string {
  const brand = options?.brandColor || "#1a73e8";
  const title = options?.title || "";
  const preheader = options?.preheader || "";
  const footer = options?.footerText || "Sent securely via Gmail Browser MCP";

  // Escape special HTML chars in plain text segments
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  // Format paragraphs and line breaks
  const lines = bodyText.split("\n\n");
  const formattedParagraphs = lines
    .map((para) => {
      const trimmed = para.trim();
      if (!trimmed) return "";

      // List item detection
      if (trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const items = trimmed
          .split("\n")
          .map((item) => {
            const clean = item.replace(/^[\s•\-\*]+\s*/, "");
            return `<li style="margin-bottom: 6px; font-size: 14px; line-height: 1.6; color: #333333;">${escapeHtml(clean)}</li>`;
          })
          .join("");
        return `<ul style="margin: 12px 0; padding-left: 20px;">${items}</ul>`;
      }

      // Blockquote detection
      if (trimmed.startsWith("> ")) {
        const quote = trimmed.replace(/^>\s*/gm, "");
        return `<blockquote style="margin: 12px 0; padding: 10px 16px; border-left: 4px solid ${brand}; background-color: #f8f9fa; color: #555555; font-style: italic;">${escapeHtml(quote)}</blockquote>`;
      }

      return `<p style="margin: 0 0 14px 0; font-size: 15px; line-height: 1.6; color: #202124;">${escapeHtml(trimmed)}</p>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f3f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  ${preheader ? `<div style="display: none; max-height: 0px; overflow: hidden;">${escapeHtml(preheader)}</div>` : ""}
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          ${
            title
              ? `<tr>
            <td style="padding: 24px 28px 12px 28px; background-color: #ffffff; border-bottom: 1px solid #e8eaed;">
              <h2 style="margin: 0; color: ${brand}; font-size: 20px; font-weight: 600;">${escapeHtml(title)}</h2>
            </td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding: 28px;">
              ${formattedParagraphs}
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 28px; background-color: #f8f9fa; border-top: 1px solid #e8eaed; font-size: 12px; color: #5f6368; text-align: center;">
              ${escapeHtml(footer)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
