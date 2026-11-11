import type { Page, Locator } from "playwright";
export declare class RateLimiter {
    private lastActionTime;
    private minIntervalMs;
    private maxSearchResults;
    private recentActions;
    private maxActionsPerMinute;
    private pacingQueue;
    constructor(options?: {
        minIntervalMs?: number;
        maxSearchResults?: number;
        maxActionsPerMinute?: number;
    });
    clampSearchLimit(limit?: any): number;
    enforcePacing(actionName: string): Promise<void>;
    recordActionCompleted(): void;
    private sleep;
}
export declare function fastInjectText(page: Page, locator: Locator, text: string): Promise<void>;
export declare function fastFillRecipient(page: Page, locator: Locator, recipient: string): Promise<void>;
export declare function fastFillSubject(locator: Locator, subject: string): Promise<void>;
export declare function humanType(page: Page, locator: Locator, text: string): Promise<void>;
export declare const defaultRateLimiter: RateLimiter;
