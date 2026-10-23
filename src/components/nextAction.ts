import type { ActivityDTO, ContactDTO } from "@/lib/types";
import { firstName, todayStr, type Model, taskLeadIds } from "./model";

/**
 * Next best action: what to do next with a lead, worked out from its timeline. These rules need no AI,
 * so every lead gets a suggestion instantly; the AI suggestion (when there is one) adds judgement on top.
 * Each suggestion has a signature that changes when the situation changes, so a snoozed one comes back
 * by itself when something new happens.
 */
export type ActionKind = "email" | "call" | "meeting" | "note" | "task";
export type NextAction = { sig: string; text: string; why: string; kind: ActionKind; urgency: 1 | 2 | 3; source: "rule" | "ai"; taskTitle: string };

const DAY = 86400_000;
const days = (ms: number) => Math.max(0, Math.floor((Date.now() - ms) / DAY));
const ago = (ms: number) => { const d = days(ms); return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
const fmt = (ms: number) => new Date(ms).toLocaleDateString([], { day: "numeric", month: "short" });
const OUT: ActivityDTO["type"][] = ["email", "call", "meeting"];

export function ruleActions(m: Model, c: ContactDTO): NextAction[] {
  if (c.status === "won" || c.status === "lost") return [];
  const name = firstName(c.name) || c.name;
  const acts = (m.actsByContact.get(c.id) || []).filter((a) => !a.preview);
  const lastOf = (f: (a: ActivityDTO) => boolean) => acts.filter(f).reduce<ActivityDTO | null>((x, a) => (!x || a.at > x.at ? a : x), null);
  const lastOut = lastOf((a) => OUT.includes(a.type) && !!a.byId);
  const lastEmail = lastOf((a) => a.type === "email");
  const lastReply = lastOf((a) => a.type === "reply");
  const lastAny = lastOf(() => true);
  const canEmail = !!c.email && !c.unsubscribedAt;
  const out: NextAction[] = [];
  const add = (a: Omit<NextAction, "source">) => out.push({ ...a, source: "rule" });

  // they wrote and nobody has answered
  if (lastReply && (!lastEmail || lastEmail.at < lastReply.at) && Date.now() - lastReply.at > 4 * 3600_000)
    add({ sig: `reply:${lastReply.id}`, kind: canEmail ? "email" : "call", urgency: 3, text: `Reply to ${name}`, why: `They wrote ${ago(lastReply.at)}${lastReply.subject ? ` ("${lastReply.subject.slice(0, 60)}")` : ""} and haven't had an answer.`, taskTitle: `Reply to ${c.name}` });
  // they asked for something and it hasn't been sent
  const req = lastOf((a) => a.type === "request");
  if (req && !(lastEmail && lastEmail.at > req.at)) {
    const what = (req.subject || req.body || "something").replace(/^(send|share)\s+/i, "").slice(0, 60).toLowerCase();
    add({ sig: `request:${req.id}`, kind: canEmail ? "email" : "call", urgency: days(req.at) >= 2 ? 3 : 2, text: `Send ${name} the ${what}`, why: `${name} asked for the ${what} ${ago(req.at)} and it hasn't been sent yet.`, taskTitle: `Send ${c.name} the ${what}` });
  }
  // a meeting happened and nothing since
  const meet = lastOf((a) => a.type === "meeting" && (a.meetingAt || a.at) < Date.now());
  if (meet) {
    const when = meet.meetingAt || meet.at;
    const after = acts.some((a) => a.at > when && a.id !== meet.id && (OUT.includes(a.type) || a.type === "note"));
    if (!after && days(when) >= 2) add({ sig: `meeting:${meet.id}`, kind: canEmail ? "email" : "call", urgency: days(when) >= 5 ? 3 : 2, text: `Follow up on the meeting of ${fmt(when)}`, why: `No contact since the meeting ${ago(when)}. Send a recap with the next steps.`, taskTitle: `Send ${c.name} a meeting recap` });
  }
  // proposal out, no answer
  if (c.status === "proposal" && lastEmail && (!lastReply || lastReply.at < lastEmail.at) && days(lastEmail.at) >= 10)
    add({ sig: `proposal:${lastEmail.id}`, kind: c.phone ? "call" : "email", urgency: 2, text: `Check in on the proposal with ${name}`, why: `The last email went ${ago(lastEmail.at)} with no reply since.${c.phone ? " A short call often moves it on." : ""}`, taskTitle: `Check in with ${c.name} on the proposal` });
  // last email bounced
  if (lastEmail?.bounced && (!lastOut || lastOut.id === lastEmail.id))
    add({ sig: `bounce:${lastEmail.id}`, kind: c.phone ? "call" : "note", urgency: 2, text: `Find a working email for ${name}`, why: `The email ${ago(lastEmail.at)} bounced.${c.phone ? " Call instead, or ask for a new address." : ""}`, taskTitle: `Find a new email address for ${c.name}` });
  // overdue tasks on this lead
  const late = m.tasks.filter((t) => !t.done && taskLeadIds(t).includes(c.id) && t.dueDate && t.dueDate < todayStr());
  if (late.length) add({ sig: `task:${late[0].id}`, kind: "task", urgency: 2, text: `Overdue task: ${late[0].title}`, why: `Due ${late[0].dueDate}${late.length > 1 ? `, and ${late.length - 1} more overdue on this lead` : ""}.`, taskTitle: late[0].title });
  // follow-up date passed
  if (c.nextFollowUp && c.nextFollowUp < todayStr())
    add({ sig: `followup:${c.nextFollowUp}`, kind: canEmail ? "email" : "call", urgency: 2, text: `Follow up with ${name}`, why: `The follow-up was due on ${c.nextFollowUp}.`, taskTitle: `Follow up with ${c.name}` });
  // never contacted
  if (!lastOut) add({ sig: `new:${c.id}`, kind: canEmail ? "email" : "call", urgency: (c.rating || 0) >= 4 ? 3 : 1, text: `Introduce yourself to ${name}`, why: `${(c.rating || 0) >= 4 ? "Rated hot, but n" : "N"}ot contacted yet${days(c.createdAt) ? `; added ${ago(c.createdAt)}` : ""}.`, taskTitle: `First contact with ${c.name}` });
  // hot and gone quiet
  else if ((c.rating || 0) >= 4 && lastAny && days(lastAny.at) >= 7)
    add({ sig: `quiet:${lastAny.id}`, kind: c.phone ? "call" : "email", urgency: 2, text: `Re-engage ${name}`, why: `A hot lead (${c.rating}★), quiet for ${days(lastAny.at)} days.`, taskTitle: `Re-engage ${c.name}` });
  // unsubscribed: don't suggest emails
  return out.map((a) => (c.unsubscribedAt && a.kind === "email" ? { ...a, kind: c.phone ? "call" as const : "note" as const, why: `${a.why} They unsubscribed from emails.` } : a))
    .sort((a, b) => b.urgency - a.urgency);
}

/** Suggestions not snoozed by me. */
export function activeActions(m: Model, c: ContactDTO, list: NextAction[]) {
  const today = todayStr();
  return list.filter((a) => !m.snoozes.some((s) => s.contactId === c.id && s.signature === a.sig && s.until > today));
}
