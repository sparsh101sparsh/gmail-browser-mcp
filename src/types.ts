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
