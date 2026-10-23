import { HttpError } from "./http";
import { requireUser } from "./session";

/** Voice transcription: anyone who can edit (rep and up). */
export async function requireVoiceUser() {
  const me = await requireUser("viewer");
  if (!["rep", "manager", "admin"].includes(me.role)) throw new HttpError(403, "Your role is view-only, so voice notes aren't available.");
  return me;
}
