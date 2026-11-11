import type { Page } from "playwright";
export declare class GmailSafetyError extends Error {
    readonly code: string;
    readonly url: string;
    constructor(message: string, code: string, url: string);
}
export declare function checkPageSafety(page: Page): Promise<void>;
