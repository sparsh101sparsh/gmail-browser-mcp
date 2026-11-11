export class GmailSafetyError extends Error {
  public code: string;
  public url: string;

  constructor(code: string, url: string, message: string) {
    super(message);
    this.name = "GmailSafetyError";
    this.code = code;
    this.url = url;
  }
}
