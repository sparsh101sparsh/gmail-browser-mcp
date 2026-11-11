import type { Page } from "playwright";
export interface ValidatedAttachments {
    resolvedPaths: string[];
    totalSizeBytes: number;
}
export declare function validateAttachments(attachmentPaths?: string[]): ValidatedAttachments;
export declare function attachFilesAndWait(page: Page, attachmentPaths: string[], timeoutMs?: number): Promise<void>;
