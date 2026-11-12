/**
 * RFC 5322 Compliant Recipient Parser
 * Accurately parses recipient strings containing multiple email addresses,
 * quoted display names with commas, angle-bracketed emails, and semicolons.
 *
 * Example:
 * '"Doe, Jane" <jane@example.com>, "Smith, Bob" <bob@example.com>; charlie@example.com'
 * => ['"Doe, Jane" <jane@example.com>', '"Smith, Bob" <bob@example.com>', 'charlie@example.com']
 */
export function parseRecipients(input) {
    if (!input || typeof input !== "string") {
        return [];
    }
    const trimmed = input.trim();
    if (!trimmed) {
        return [];
    }
    const recipients = [];
    let current = "";
    let inQuotes = false;
    let inAngleBrackets = false;
    for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];
        if (char === '"' && trimmed[i - 1] !== "\\") {
            inQuotes = !inQuotes;
            current += char;
        }
        else if (char === "<" && !inQuotes) {
            inAngleBrackets = true;
            current += char;
        }
        else if (char === ">" && !inQuotes) {
            inAngleBrackets = false;
            current += char;
        }
        else if ((char === "," || char === ";") && !inQuotes && !inAngleBrackets) {
            const entry = current.trim();
            if (entry) {
                recipients.push(entry);
            }
            current = "";
        }
        else {
            current += char;
        }
    }
    const trailing = current.trim();
    if (trailing) {
        recipients.push(trailing);
    }
    return recipients;
}
/**
 * Extracts pure email address from a recipient token like 'Jane Doe <jane@example.com>'
 */
export function extractCleanEmail(recipient) {
    if (!recipient)
        return "";
    const match = recipient.match(/<([^>]+)>/);
    if (match && match[1]) {
        return match[1].trim();
    }
    return recipient.replace(/^["']|["']$/g, "").trim();
}
//# sourceMappingURL=recipients.js.map