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

export interface ReplyEmailArgs {
  thread_id?: string;
  search_query?: string;
  body: string;
  reply_all?: boolean;
  attachment_paths?: string[];
}

export interface ReplyEmailResult {
  status: "success" | "error";
  message: string;
  thread_id?: string;
  replied_at: string;
  reply_all: boolean;
  attachment_count: number;
}

export interface ForwardEmailArgs {
  thread_id?: string;
  search_query?: string;
  to: string;
  body?: string;
  attachment_paths?: string[];
}

export interface ForwardEmailResult {
  status: "success" | "error";
  message: string;
  to: string;
  thread_id?: string;
  forwarded_at: string;
  attachment_count: number;
}

export interface SaveDraftArgs {
  to?: string;
  subject?: string;
  body?: string;
  cc?: string;
  bcc?: string;
  attachment_paths?: string[];
}

export interface SaveDraftResult {
  status: "success" | "error";
  message: string;
  draft_id?: string;
  saved_at: string;
  attachment_count: number;
}

export interface ListDraftsArgs {
  limit?: number;
}

export interface DraftSummaryItem {
  id?: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
}

export interface ListDraftsResult {
  count: number;
  drafts: DraftSummaryItem[];
}

export interface DeleteDraftArgs {
  draft_id?: string;
  query?: string;
}

export interface DeleteDraftResult {
  status: "success" | "error";
  message: string;
}

export interface MailboxActionArgs {
  thread_id?: string;
  query?: string;
}

export interface MailboxActionResult {
  status: "success" | "error";
  message: string;
  action: string;
  target?: string;
  timestamp: string;
}

export interface EmptyTrashResult {
  status: "success" | "error";
  message: string;
  emptied_at: string;
}

export interface LabelActionArgs {
  thread_id?: string;
  query?: string;
  label: string;
}

export interface LabelActionResult {
  status: "success" | "error";
  message: string;
  label: string;
  action: string;
  target?: string;
}

export interface ListLabelsResult {
  system_labels: string[];
  user_labels: string[];
  total_count: number;
}

export interface ManageLabelArgs {
  name: string;
}

export interface ManageLabelResult {
  status: "success" | "error";
  message: string;
  label_name: string;
  action: "created" | "deleted";
}

export interface SnoozeEmailArgs {
  thread_id?: string;
  query?: string;
  until?: string; // e.g. "tomorrow", "next_week", or date string
}

export interface SnoozeEmailResult {
  status: "success" | "error";
  message: string;
  snoozed_until: string;
  target?: string;
}

export interface DownloadAttachmentArgs {
  thread_id?: string;
  query?: string;
  attachment_name?: string;
  destination_dir?: string;
}

export interface DownloadAttachmentResult {
  status: "success" | "error";
  message: string;
  filename: string;
  saved_path: string;
  size_bytes?: number;
}

export interface GetInboxStatsResult {
  unread_primary: number;
  unread_total: number;
  categories: {
    primary: number;
    promotions: number;
    social: number;
    updates: number;
  };
  total_conversations_inbox?: number;
  checked_at: string;
}

export interface CheckSessionResult {
  authenticated: boolean;
  accountIndex: number;
  email?: string;
  message: string;
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
