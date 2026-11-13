/**
 * Smart Email Priority & Triage Engine
 * Classifies email messages by urgency, actionability, and security relevance.
 */

import type { EmailSummaryItem } from "../types.js";

export type PriorityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NEWSLETTER";

export interface TriageClassification {
  priority: PriorityLevel;
  score: number; // 1 to 5
  category: "Security" | "Billing" | "Action Required" | "Personal" | "Marketing";
  recommendedAction: string;
}

export function classifyEmailPriority(email: Partial<EmailSummaryItem>): TriageClassification {
  const subject = (email.subject || "").toLowerCase();
  const sender = (email.sender || "").toLowerCase();
  const snippet = (email.snippet || "").toLowerCase();
  const combined = `${sender} ${subject} ${snippet}`;

  // 1. Critical: Security Alerts & Suspicious Activity
  if (
    combined.includes("security alert") ||
    combined.includes("new sign-in") ||
    combined.includes("unusual activity") ||
    combined.includes("password reset") ||
    combined.includes("2-step verification") ||
    combined.includes("verification code")
  ) {
    return {
      priority: "CRITICAL",
      score: 5,
      category: "Security",
      recommendedAction: "Review immediately to secure account credentials.",
    };
  }

  // 2. High: Billing & Invoices
  if (
    combined.includes("invoice") ||
    combined.includes("payment received") ||
    combined.includes("receipt") ||
    combined.includes("billing statement") ||
    combined.includes("overdue") ||
    combined.includes("charge failed")
  ) {
    return {
      priority: "HIGH",
      score: 4,
      category: "Billing",
      recommendedAction: "Verify invoice or payment status.",
    };
  }

  // 3. High: Direct Action Items
  if (
    subject.includes("urgent") ||
    subject.includes("action required") ||
    subject.includes("asap") ||
    subject.includes("deadline") ||
    subject.includes("time-sensitive")
  ) {
    return {
      priority: "HIGH",
      score: 4,
      category: "Action Required",
      recommendedAction: "Prioritize response or execution today.",
    };
  }

  // 4. Newsletter / Marketing
  if (
    combined.includes("unsubscribe") ||
    combined.includes("newsletter") ||
    combined.includes("special offer") ||
    combined.includes("limited time deal") ||
    combined.includes("view in browser")
  ) {
    return {
      priority: "NEWSLETTER",
      score: 1,
      category: "Marketing",
      recommendedAction: "Archive or skim during bulk triage.",
    };
  }

  // 5. Default: Medium / Low
  if (email.is_unread) {
    return {
      priority: "MEDIUM",
      score: 3,
      category: "Personal",
      recommendedAction: "Read and reply at standard convenience.",
    };
  }

  return {
    priority: "LOW",
    score: 2,
    category: "Personal",
    recommendedAction: "Already read. No action needed.",
  };
}

export function triageEmailList(emails: EmailSummaryItem[]): Array<EmailSummaryItem & { triage: TriageClassification }> {
  return emails.map((item) => ({
    ...item,
    triage: classifyEmailPriority(item),
  }));
}
