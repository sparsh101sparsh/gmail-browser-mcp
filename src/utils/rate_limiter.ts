import type { Page, Locator } from "playwright";

export class RateLimiter {
  private lastActionTime: number = 0;
  private minIntervalMs: number;
  private maxSearchResults: number;
  private recentActions: number[] = [];
  private maxActionsPerMinute: number;
  private pacingQueue: Promise<void> = Promise.resolve();

  constructor(options?: { minIntervalMs?: number; maxSearchResults?: number; maxActionsPerMinute?: number }) {
    this.minIntervalMs = options?.minIntervalMs ?? Number(process.env.GMAIL_PACING_MS || 2500);
    this.maxSearchResults = options?.maxSearchResults ?? 30;
    this.maxActionsPerMinute = options?.maxActionsPerMinute ?? 10;
  }

  public clampSearchLimit(limit?: any): number {
    const defaultLimit = 10;
    if (limit === undefined || limit === null) return defaultLimit;
    const num = Number(limit);
    if (isNaN(num)) return defaultLimit;
    const val = Math.floor(num);
    if (val <= 0) return defaultLimit;
    if (val > this.maxSearchResults) return this.maxSearchResults;
    return val;
  }

  public async enforcePacing(actionName: string): Promise<void> {
    const previous = this.pacingQueue;
    let releaseQueue: () => void = () => {};
    this.pacingQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });

    await previous.catch(() => {});

    try {
      const now = Date.now();
      this.recentActions = this.recentActions.filter((t) => now - t < 60000);

      if (this.recentActions.length >= this.maxActionsPerMinute) {
        const oldestInWindow = this.recentActions[0];
        const waitTime = 60000 - (now - oldestInWindow) + 500;
        await this.sleep(waitTime);
      }

      const elapsed = Date.now() - this.lastActionTime;
      if (elapsed < this.minIntervalMs) {
        await this.sleep(this.minIntervalMs - elapsed);
      }

      this.lastActionTime = Date.now();
      this.recentActions.push(this.lastActionTime);
    } finally {
      releaseQueue();
    }
  }

  public recordActionCompleted(): void {
    this.lastActionTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const defaultRateLimiter = new RateLimiter();
