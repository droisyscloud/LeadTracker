import { eq, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { bootstrapFor } from "./bootstrapData";
import { complete, parseJson } from "./llm";
import type { CurrentUser } from "./session";
import { company as ourCompany } from "./brand";

/**
 * The the app assistant. The AI may LOOK things up (run at once, only over what this person can see) and may
 * PROPOSE actions. Proposed actions are never run here: they go back to the person as cards, and only run when
 * they press Confirm (see /api/agent/act, which goes through the app's normal routes and permissions).
 */
export type AgentMsg = { role: "user" | "assistant"; content: string };
export type AgentAction = { tool: WriteTool; args: Record<string, unknown>; summary: string };
export const WRITE_TOOLS = ["create_task", "add_note", "log_call", "set_follow_up", "set_stage", "mark_task_done", "create_contact", "send_email"] as const;
export type WriteTool = (typeof WRITE_TOOLS)[number];
const STAGES = ["new", "contacted", "engaged", "meeting", "proposal", "won", "lost"];
const TOOLS_DOC = `LOOK-UPS (run immediately, results come back to you):
- find_contacts {query}: leads matching a name, company, email or tag
- contact_details {contactId}: one lead's details, recent timeline, open tasks and deals
- find_companies {query}
- my_tasks {filter: "overdue"|"today"|"open"|"done"}
- followups_due {}: leads due for contact now
- deals {stage?}: open deals (or a stage) with value and close date
- agenda {days: 1-14}: meetings and tasks coming up
- find_notes {query}: notes from events
ACTIONS (only proposed; the person must confirm each one):
- create_task {title, dueDate?: "YYYY-MM-DD", contactIds?: [ids], companyIds?: [ids], notes?, priority?: "low"|"normal"|"high"|"urgent"}
- add_note {contactId, text}
- log_call {contactId, notes, connected?: true|false}
- set_follow_up {contactId, date: "YYYY-MM-DD" or null to clear}
- set_stage {contactId, stage: ${STAGES.join("|")}}
- mark_task_done {taskId}
- create_contact {name, email?, phone?, company?, title?}
- send_email {contactId, subject, body}  (sent from the person's own mailbox)`;

const short = (s: string | null | undefined, n = 160) => { const t = (s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };
const day = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);

export async function runAgent(me: CurrentUser, messages: AgentMsg[]) {
  const m = await bootstrapFor(me);
  const contact = (id: string) => m.contacts.find((c) => c.id === id); const company = (id: string | null) => m.companies.find((c) => c.id === id);
  const today = new Date().toLocaleDateString("en-CA");
  const lookup = async (tool: string, a: Record<string, unknown>): Promise<unknown> => {
    const q = String(a.query || "").toLowerCase().trim();
    switch (tool) {
      case "find_contacts": return m.contacts.filter((c) => !q || `${c.name} ${c.email} ${c.title} ${company(c.companyId)?.name || ""} ${(c.tags || []).join(" ")}`.toLowerCase().includes(q)).slice(0, 10)
        .map((c) => ({ id: c.id, name: c.name, title: c.title, company: company(c.companyId)?.name || "", stage: c.status, rating: c.rating, nextFollowUp: c.nextFollowUp, email: c.email }));
      case "contact_details": { const c = contact(String(a.contactId)); if (!c) return { error: "No lead with that id that you can see." };
        const acts = m.activities.filter((x) => x.contactId === c.id).sort((x, y) => y.at - x.at).slice(0, 15).map((x) => ({ type: x.type, date: day(x.at), subject: x.subject, text: x.private ? "(private email)" : short(x.body, 220) }));
        return { id: c.id, name: c.name, title: c.title, company: company(c.companyId)?.name, email: c.email, phone: c.phone, stage: c.status, rating: c.rating, nextFollowUp: c.nextFollowUp, background: short(c.background, 300),
          timeline: acts, openTasks: m.tasks.filter((t) => !t.done && [t.contactId, ...(t.contactIds || [])].includes(c.id)).map((t) => ({ id: t.id, title: t.title, due: t.dueDate })),
          deals: m.deals.filter((d) => d.contactId === c.id || (d.companyId && d.companyId === c.companyId)).map((d) => ({ name: d.name, stage: d.stage, value: d.value, closeDate: d.closeDate })) }; }
      case "find_companies": return m.companies.filter((c) => !q || `${c.name} ${c.website || ""}`.toLowerCase().includes(q)).slice(0, 10).map((c) => ({ id: c.id, name: c.name, website: c.website, people: m.contacts.filter((x) => x.companyId === c.id).length }));
      case "my_tasks": { const f = String(a.filter || "open"); const mine = m.tasks.filter((t) => t.assigneeId === me.id);
        const pick = f === "done" ? mine.filter((t) => t.done) : mine.filter((t) => !t.done && (f === "overdue" ? !!t.dueDate && t.dueDate < today : f === "today" ? t.dueDate === today : true));
        return pick.slice(0, 25).map((t) => ({ id: t.id, title: t.title, due: t.dueDate, priority: t.priority, leads: [t.contactId, ...(t.contactIds || [])].filter(Boolean).map((x) => contact(x as string)?.name).filter(Boolean) })); }
      case "followups_due": return m.contacts.filter((c) => !["won", "lost"].includes(c.status) && c.nextFollowUp && c.nextFollowUp <= today && !(c.followupDismissedOn && c.nextFollowUp <= c.followupDismissedOn))
        .slice(0, 25).map((c) => ({ id: c.id, name: c.name, company: company(c.companyId)?.name || "", due: c.nextFollowUp, stage: c.status }));
      case "deals": return m.deals.filter((d) => (a.stage ? d.stage === a.stage : !["won", "lost"].includes(d.stage))).slice(0, 25).map((d) => ({ name: d.name, stage: d.stage, value: d.value, currency: d.currency, closeDate: d.closeDate, company: company(d.companyId)?.name || "" }));
      case "agenda": { const n = Math.min(14, Math.max(1, Number(a.days) || 1)); const end = Date.now() + n * 86400_000; const seen = new Set<string>();
        const meetings = m.activities.filter((x) => x.type === "meeting" && !x.cancelled && x.meetingAt && x.meetingAt >= Date.now() - 3600_000 && x.meetingAt <= end && x.byId === me.id)
          .filter((x) => { const k = `${x.meetingAt}|${x.subject}`; if (seen.has(k)) return false; seen.add(k); return true; })
          .map((x) => ({ when: new Date(x.meetingAt!).toISOString(), title: x.subject, with: contact(x.contactId)?.name }));
        const endDay = new Date(end).toLocaleDateString("en-CA");
        return { meetings, tasks: m.tasks.filter((t) => t.assigneeId === me.id && !t.done && t.dueDate && t.dueDate <= endDay).map((t) => ({ id: t.id, title: t.title, due: t.dueDate })) }; }
      case "find_notes": { const rows = await db.select().from(schema.stories).where(me.role === "admin" ? undefined : or(eq(schema.stories.createdById, me.id), eq(schema.stories.shared, true), sql`${schema.stories.sharedWith} @> ${JSON.stringify([me.id])}::jsonb`)).limit(100);
        return rows.filter((s) => !q || s.title.toLowerCase().includes(q) || (s.summary?.summary || "").toLowerCase().includes(q)).slice(0, 10).map((s) => ({ id: s.id, title: s.title, summary: short(s.summary?.summary, 240), link: `/notes?id=${s.id}` })); }
      default: return { error: `Unknown look-up ${tool}` };
    }
  };
  // check a proposed action against what this person can see, and describe it plainly
  const vet = (x: { tool?: string; args?: Record<string, unknown>; summary?: string }): AgentAction | string => {
    const tool = String(x.tool) as WriteTool; const a = (x.args || {}) as Record<string, unknown>;
    if (!WRITE_TOOLS.includes(tool)) return `Skipped an unknown action (${x.tool}).`;
    const needContact = ["add_note", "log_call", "set_follow_up", "set_stage", "send_email"].includes(tool);
    if (needContact && !contact(String(a.contactId))) return "Skipped an action for a lead I couldn't find.";
    if (tool === "create_task") { a.contactIds = ((a.contactIds as string[]) || []).filter((id) => contact(id)); a.companyIds = ((a.companyIds as string[]) || []).filter((id) => company(id)); if (!String(a.title || "").trim()) return "Skipped a task with no title."; }
    if (tool === "mark_task_done" && !m.tasks.some((t) => t.id === a.taskId)) return "Skipped a task I couldn't find.";
    if (tool === "set_stage" && !STAGES.includes(String(a.stage))) return "Skipped an unknown stage.";
    if (tool === "create_contact" && !String(a.name || "").trim()) return "Skipped a new lead with no name.";
    const who = a.contactId ? contact(String(a.contactId))?.name : "";
    const summary = String(x.summary || "").trim() || ({ create_task: `Create the task "${a.title}"`, add_note: `Add a note to ${who}`, log_call: `Log a call with ${who}`, set_follow_up: a.date ? `Set ${who}'s follow-up to ${a.date}` : `Clear ${who}'s follow-up`,
      set_stage: `Move ${who} to ${a.stage}`, mark_task_done: "Mark the task done", create_contact: `Add ${a.name} as a new lead`, send_email: `Email ${who}: "${a.subject}"` } as Record<WriteTool, string>)[tool];
    return { tool, args: a, summary };
  };
  const conv = messages.slice(-12).map((x) => `${x.role === "user" ? "PERSON" : "ASSISTANT"}: ${x.content.slice(0, 4000)}`).join("\n");
  let work = ""; const notes: string[] = [];
  for (let round = 0; round < 4; round++) {
    const us = await ourCompany();
    const out = await complete({ maxTokens: 1500, prompt: `SALES ASSISTANT. You are the assistant inside ${us.name}'s sales CRM. You help ${me.name || me.email} (role: ${me.role}). Today is ${today}.
You can look things up and propose actions. Proposed actions are NOT done until the person confirms them, so never say an action is done; say what you'll do and ask them to confirm.
Use look-ups to find ids before proposing actions; never invent ids. Keep replies short and plain. Dates as YYYY-MM-DD.
${TOOLS_DOC}
Reply ONLY with JSON: {"reply": "text for the person", "lookups": [{"tool": "...", "args": {}}], "actions": [{"tool": "...", "args": {}, "summary": "one plain sentence"}]}
If you need look-ups, return them with an empty reply; you'll get the results and answer next.

CONVERSATION:
${conv}${work ? `\n\nLOOK-UP RESULTS SO FAR:\n${work}` : ""}` });
    const j = parseJson<{ reply?: string; lookups?: { tool: string; args?: Record<string, unknown> }[]; actions?: { tool?: string; args?: Record<string, unknown>; summary?: string }[] }>(out, "{");
    const looks = (j.lookups || []).slice(0, 5);
    if (looks.length && round < 3) { for (const l of looks) work += `\n${l.tool}(${JSON.stringify(l.args || {})}) => ${JSON.stringify(await lookup(l.tool, l.args || {})).slice(0, 6000)}`; continue; }
    const actions: AgentAction[] = []; for (const x of (j.actions || []).slice(0, 8)) { const v = vet(x); if (typeof v === "string") notes.push(v); else actions.push(v); }
    return { reply: [String(j.reply || "").trim() || (actions.length ? "Here's what I'll do. Confirm to go ahead." : "I couldn't find an answer to that."), ...notes].join("\n"), actions };
  }
  return { reply: "That took too many steps. Try asking more specifically.", actions: [] as AgentAction[] };
}
