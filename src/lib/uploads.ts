import { HttpError } from "./http";

/**
 * Attachment rules for task replies: images, audio, video, PDF, Office and text files.
 * Types that could run code in a browser (HTML, SVG, scripts, executables) are refused.
 */
export const TASK_MAX_UPLOAD_BYTES = Number(process.env.TASK_MAX_UPLOAD_MB || 50) * 1024 * 1024;
const BY_EXT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", heic: "image/heic", heif: "image/heif",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", weba: "audio/webm", opus: "audio/ogg",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  pdf: "application/pdf", txt: "text/plain", csv: "text/csv", rtf: "application/rtf",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", odp: "application/vnd.oasis.opendocument.presentation",
  key: "application/vnd.apple.keynote", pages: "application/vnd.apple.pages", numbers: "application/vnd.apple.numbers",
  zip: "application/zip",
};
const ALLOWED = new Set(Object.values(BY_EXT));
const BLOCKED_EXT = /\.(html?|svg|xhtml|js|mjs|exe|bat|cmd|sh|ps1|msi|dll|jar|app|scr|com|vbs|php)$/i;

/** Decide the content type to store and serve. Browsers often send an empty or vague type, so the extension is the fallback. */
export function checkAttachment(f: File): string {
  if (f.size > TASK_MAX_UPLOAD_BYTES) throw new HttpError(413, `${f.name} is larger than ${Math.round(TASK_MAX_UPLOAD_BYTES / 1048576)} MB.`);
  if (f.size === 0) throw new HttpError(400, `${f.name} is empty.`);
  if (BLOCKED_EXT.test(f.name)) throw new HttpError(415, `${f.name}: this kind of file can't be attached for security reasons.`);
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  const declared = (f.type || "").split(";")[0].trim().toLowerCase();
  if (declared && ALLOWED.has(declared)) return declared;
  if (declared.startsWith("audio/") || declared.startsWith("video/")) return declared === "video/x-m4v" ? "video/mp4" : declared;
  if (BY_EXT[ext]) return BY_EXT[ext];
  throw new HttpError(415, `${f.name}: this file type isn't supported. Use images, audio, video, PDF, Office documents or text files.`);
}
