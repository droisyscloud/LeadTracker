"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, useData } from "./data";
import { Avatar, Icon } from "./ui";
import { ago, userName } from "./model";
import { KINDS, type Kind } from "./kinds";

/** Notification bell: assignments, tags, mentions, replies and status changes on tasks. */
/** Which kind a notification is about, so it wears that kind's colour. */
const notifKind = (k: string): Kind => k === "reply" ? "email-in" : k === "content" ? "email-in" : k === "booking" ? "meeting" : k === "unsubscribed" ? "system" : ["mentioned", "comment", "tagged"].includes(k) ? "team" : "task";

export function Bell() {
  const { m, reload } = useData(); const router = useRouter();
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [open]);
  const unread = m.notifications.filter((n) => !n.read).length;
  useEffect(() => {
    const f = (e: MouseEvent) => { if ((e.target as Element)?.closest?.(".demo-layer")) return; if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", f); return () => document.removeEventListener("pointerdown", f);
  }, []);
  const go = async (id: string, taskId: string | null, link: string | null) => {
    setOpen(false);
    await api("/api/notifications", { json: { ids: [id] } }).catch(() => undefined); reload();
    if (link) router.push(link); else if (taskId) router.push(`/tasks?id=${taskId}`);
  };
  return <div className="acctwrap" ref={ref}>
    <button className="btn icon bell" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
      <Icon name="bell" />{unread > 0 && <span className="bell-n">{unread > 9 ? "9+" : unread}</span>}</button>
    {open && <div className="menu-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />}
    {open && <div className="menu notif" role="menu">
      <div className="inline" style={{ justifyContent: "space-between", padding: "10px 12px 6px" }}><b>Notifications</b>
        {unread > 0 && <button className="linkbtn" onClick={async () => { await api("/api/notifications", { json: { all: true } }); reload(); }}>Mark all read</button>}</div>
      {m.notifications.length ? <ul>{m.notifications.map((n) => { const t = n.taskId ? m.tasks.find((x) => x.id === n.taskId) : undefined;
        return <li key={n.id}><button className={n.read ? "" : "unread"} onClick={() => go(n.id, n.taskId, n.link)}>
          <span className="nkind-wrap"><Avatar name={userName(m, n.actorId)} image={n.actorId ? m.userMap.get(n.actorId)?.image : null} size={28} />
            <span className="nkind" style={{ ["--kc" as string]: KINDS[notifKind(n.kind)].color }} title={KINDS[notifKind(n.kind)].label}><Icon name={KINDS[notifKind(n.kind)].icon} size={10} /></span></span>
          <span><span>{n.text}</span>{t && <><br /><b>{t.title}</b></>}<br /><span className="small muted">{ago(n.at)}</span></span>
          {!n.read && <i className="dot" style={{ background: "var(--blue)" }} aria-label="Unread" />}</button></li>; })}</ul>
        : <p className="small muted" style={{ padding: "6px 12px 14px", margin: 0 }}>Nothing yet. You'll see it here when someone assigns, tags or mentions you, and when tasks are due.</p>}
    </div>}
  </div>;
}
