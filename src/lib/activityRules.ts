/**
 * Which entries can have their text changed: things people wrote into the tracker (notes, calls, meetings,
 * requests, pasted replies, emails logged but not sent). Emails that actually went out, synced mail,
 * sequence emails and website form messages are records of what was said, so they stay as they are.
 */
export function editable(a: { type: string; origin: string; delivery: string | null }) {
  if (a.origin === "sync" || a.origin === "sequence" || a.origin === "intake") return false;
  if (a.type === "email" && a.delivery) return false;
  return true;
}
