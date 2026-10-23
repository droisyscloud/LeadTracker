export const appUrl = () => (process.env.APP_URL || process.env.AUTH_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/+$/, "");
export const mailConfigured = () => !!process.env.SMTP_HOST;
export const aiConfigured = () => !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = [
  "image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/csv", "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint", "video/mp4",
  // voice notes and recordings, as phones and browsers make them
  "audio/webm", "audio/mp4", "audio/x-m4a", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/aac", "video/webm", "video/quicktime",
];

/** A practice copy of the app: sample data, nothing ever leaves it (no email, notifications, Chat, calendar, CRM or Drive). */
export const practiceMode = () => process.env.PRACTICE_MODE === "true";
