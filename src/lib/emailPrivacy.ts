/**
 * Email privacy. The content of an email (subject, text, attachments, addresses) is visible only to its owner:
 * the person who sent it, or whose mailbox a reply came into. Everyone else, admins included, sees only that
 * an email was sent or received, and by whom, unless the owner chooses to share that email with the team.
 */
type A = { type: string; byId: string | null; mailboxUserId?: string | null; shared?: boolean | null; sharedWith?: string[] | null };
export const isEmail = (a: { type: string }) => a.type === "email" || a.type === "reply";
export const emailOwner = (a: A) => a.mailboxUserId ?? a.byId ?? null;
export const canReadEmail = (a: A, userId: string | null | undefined) => !isEmail(a) || !!a.shared || !emailOwner(a) || emailOwner(a) === userId || (!!userId && !!a.sharedWith?.includes(userId));
/** what someone else sees of a private email */
export function redactEmail<T extends Record<string, unknown>>(a: T): T {
  return { ...a, subject: "", body: "", bodyHtml: null, emailTo: [], emailCc: [], emailFrom: null, kind: null } as T;
}
