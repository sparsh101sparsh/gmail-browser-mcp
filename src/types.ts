export interface SendEmailArgs {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  attachment_paths?: string[];
}

export interface SendEmailResult {
  status: "success" | "error";
  message: string;
  to: string;
  subject: string;
  sent_at: string;
  attachment_count: number;
}

export interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface SearchEmailsArgs {
  query: string;
  limit?: number;
}

export interface EmailSummaryItem {
  id?: string;
  thread_id?: string;
  sender: string;
  sender_email?: string;
  subject: string;
  snippet: string;
  date: string;
  is_unread: boolean;
  has_attachments: boolean;
}

export interface SearchEmailsResult {
  query: string;
  count: number;
  emails: EmailSummaryItem[];
}

export interface ReadEmailArgs {
  thread_id?: string;
  message_id?: string;
  search_query?: string;
}

export interface EmailMessage {
  id?: string;
  sender: string;
  date: string;
  body: string;
  attachments: string[];
}

export interface EmailDetailResult {
  thread_id: string;
  subject: string;
  messages: EmailMessage[];
}

export interface CheckSessionResult {
  authenticated: boolean;
  accountIndex: number;
  email?: string;
  message: string;
}
