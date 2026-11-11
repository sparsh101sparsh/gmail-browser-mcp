import { type BrowserContext, type Page } from "playwright";
export declare class BrowserSessionManager {
    private browser;
    private context;
    private warmPage;
    private isInitializing;
    private warmupPromise;
    private lockPromise;
    private cookiesPath?;
    private cookieMtime;
    private accountIndex;
    constructor(options?: {
        cookiesPath?: string;
    });
    getAccountIndex(): number;
    getContext(): Promise<BrowserContext>;
    warmup(accountIndex?: number): Promise<void>;
    withWarmPage<T>(fn: (page: Page) => Promise<T>, accountIndex?: number): Promise<T>;
    withPage<T>(fn: (page: Page) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}
export declare const defaultSessionManager: BrowserSessionManager;
