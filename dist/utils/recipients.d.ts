/**
 * RFC 5322 Compliant Recipient Parser
 * Accurately parses recipient strings containing multiple email addresses,
 * quoted display names with commas, angle-bracketed emails, and semicolons.
 *
 * Example:
 * '"Doe, Jane" <jane@example.com>, "Smith, Bob" <bob@example.com>; charlie@example.com'
 * => ['"Doe, Jane" <jane@example.com>', '"Smith, Bob" <bob@example.com>', 'charlie@example.com']
 */
export declare function parseRecipients(input?: string): string[];
/**
 * Extracts pure email address from a recipient token like 'Jane Doe <jane@example.com>'
 */
export declare function extractCleanEmail(recipient: string): string;
