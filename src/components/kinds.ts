import type { ActivityDTO } from "@/lib/types";

/**
 * One visual language for every kind of activity, used everywhere activities appear
 * (lead timelines, team discussion, task threads, notifications, calendar, charts).
 * Colours are CSS variables (--k-*) defined in theme.css for dark and light mode.
 */
export type Kind = "email-out" | "email-in" | "call" | "meeting" | "note" | "request" | "file" | "system" | "team" | "task";
export const KINDS: Record<Kind, { label: string; plural: string; icon: string; color: string }> = {
  "email-out": { label: "Email sent", plural: "Emails", icon: "send", color: "var(--k-email-out)" },
  "email-in": { label: "Reply received", plural: "Replies", icon: "inbox", color: "var(--k-email-in)" },
  call: { label: "Call", plural: "Calls", icon: "phone", color: "var(--k-call)" },
  meeting: { label: "Meeting", plural: "Meetings", icon: "calendar", color: "var(--k-meeting)" },
  note: { label: "Note", plural: "Notes", icon: "note", color: "var(--k-note)" },
  request: { label: "Request", plural: "Requests", icon: "flag", color: "var(--k-request)" },
  file: { label: "File", plural: "Files", icon: "clip", color: "var(--k-file)" },
  system: { label: "Update", plural: "Updates", icon: "info", color: "var(--k-system)" },
  team: { label: "Team discussion", plural: "Team", icon: "chat", color: "var(--k-team)" },
  task: { label: "Task", plural: "Tasks", icon: "tasks", color: "var(--k-task)" },
};
/** What kind of thing a timeline entry is. */
export function activityKind(a: Pick<ActivityDTO, "type" | "byId" | "origin">): Kind {
  if (a.type === "email") return "email-out";
  if (a.type === "reply") return "email-in";
  if (a.type === "call" || a.type === "meeting" || a.type === "request" || a.type === "file") return a.type;
  if (a.type === "note" && !a.byId && a.origin !== "intake") return "system";
  return "note";
}
/** Order of the filter chips on a timeline. */
export const TIMELINE_KINDS: Kind[] = ["email-out", "email-in", "call", "meeting", "note", "request", "file", "system"];
