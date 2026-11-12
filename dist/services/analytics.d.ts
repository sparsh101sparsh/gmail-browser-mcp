/**
 * Inbox Health & Velocity Analytics Engine
 * Provides statistical analysis and workload health indicators
 * based on live Gmail categorization and unread volumes.
 */
import type { GetInboxStatsResult } from "../types.js";
export interface InboxHealthScore {
    score: number;
    rating: "Pristine (Zero Inbox)" | "Healthy" | "Moderate" | "Overwhelmed";
    primary_ratio: number;
    recommendations: string[];
}
export declare function computeInboxHealth(stats: GetInboxStatsResult): InboxHealthScore;
