declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CRON_SECRET?: string;
    RESEND_API_KEY?: string;
    MAIL_FROM?: string;
    APP_ORIGIN?: string;
  }
}
