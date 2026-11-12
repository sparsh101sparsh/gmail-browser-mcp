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
export declare function buildResponsiveEmailHtml(bodyText: string, options?: EmailTemplateOptions): string;
