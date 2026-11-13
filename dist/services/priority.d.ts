/**
 * Smart Email Priority & Triage Engine
 * Classifies email messages by urgency, actionability, and security relevance.
 */
import type { EmailSummaryItem } from "../types.js";
export type PriorityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NEWSLETTER";
export interface TriageClassification {
    priority: PriorityLevel;
    score: number;
    category: "Security" | "Billing" | "Action Required" | "Personal" | "Marketing";
    recommendedAction: string;
}
export declare function classifyEmailPriority(email: Partial<EmailSummaryItem>): TriageClassification;
export declare function triageEmailList(emails: EmailSummaryItem[]): Array<EmailSummaryItem & {
    triage: TriageClassification;
}>;
