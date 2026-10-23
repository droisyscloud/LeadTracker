"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { type Model, heatColor, lastTouch, ago, daysSince, coName, STAGE_LABEL, userName, initials } from "./model";
import type { ContactDTO } from "@/lib/types";

export const ICON: Record<string, string> = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  followups: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
  contacts: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  companies: "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3M2 21h20",
  products: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  team: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-3.5-3.5",
  moon: "M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7",
  download: "M12 4v11m-5-5l5 5 5-5M5 20h14",
  upload: "M12 16V5m-5 5l5-5 5 5M5 20h14",
  calendar: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h2M14 12h2M8 16h2",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  phone: "M6.6 3.5l2.6 4-1.7 1.7a12 12 0 0 0 7.3 7.3l1.7-1.7 4 2.6-1.3 3A2 2 0 0 1 17 21 15 15 0 0 1 3 7a2 2 0 0 1 .6-2.2z",
  note: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  inbox: "M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5a3 3 0 0 0 6 0h5",
  chat: "M5 5h14v10H9l-4 4V5z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  auto: "M12 21a9 9 0 1 0 0-18v18zM12 3a9 9 0 0 1 0 18",
  invoice: "M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6M9 16h3",
  check: "M5 12l4 4L19 6",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.5",
  plus: "M12 5v14M5 12h14",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0",
  clip: "M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3l7.5-7.5",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  send: "M4 12l16-8-6 16-2.5-6.5z",
  board: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  file: "M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7zM14 3v4h4",
  at: "M16 12a4 4 0 1 1-1.2-2.8M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3.5 7.1",
  logout: "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
  teams: "M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 7 18.5V20M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6M4 17v-1a3 3 0 0 1 2-2.8M6.5 9.5a2.2 2.2 0 1 0 0-.1M20 17v-1a3 3 0 0 0-2-2.8M17.5 9.5a2.2 2.2 0 1 0 0-.1",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  deals: "M12 3v18M17 7H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  sequences: "M4 6h7M4 12h11M4 18h16M15 4l3 2-3 2",
  events: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1M8 13h3v3H8z",
  reports: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L6 9.5 4 9l-1 3 2 1v2l-2 1 1 3 2-.5 1.5 1.5-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z",
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[name]} /></svg>;
}
export function Avatar({ name, image, size = 32 }: { name: string | null; image?: string | null; size?: number }) {
  if (image) return <img src={image} alt="" width={size} height={size} style={{ borderRadius: "50%", objectFit: "cover" }} referrerPolicy="no-referrer" />;
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", display: "inline-grid", placeItems: "center", background: "var(--blue-soft)", color: "var(--cyan)", fontFamily: "var(--display)", fontSize: size * 0.38, border: "1px solid var(--line2)", flex: "none" }}>{initials(name)}</span>;
}
export function Panel({ title, sub, action, className = "", children }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={"panel " + className}>{title != null && <header><div><h2>{title}</h2>{sub && <p className="muted small">{sub}</p>}</div>{action}</header>}{children}</section>;
}
export function ContactRow({ m, c, reason, quick, selected }: { m: Model; c: ContactDTO; reason?: string; quick?: boolean; selected?: boolean }) {
  const d = daysSince(m, c);
  return (
    <li className="row" aria-selected={selected}>
      <span className="heat" style={{ background: heatColor(m, c) }} title={"Last touch " + ago(lastTouch(m, c))} />
      <Link href={`/contacts?id=${c.id}`} className="who" style={{ color: "inherit", textDecoration: "none" }}>
        <span className="nm">{c.name}</span>
        <span className="co">{[c.title, coName(m, c)].filter(Boolean).join(", ")}</span>
        {reason && <span className="co" style={{ color: "var(--ink2)" }}>{reason}</span>}
      </Link>
      <span className="meta">
        {quick ? <span className="qa">
          {c.email && <Link className="btn" href={`/contacts?id=${c.id}&do=email`}>Email</Link>}
          {c.phone && <Link className="btn" href={`/contacts?id=${c.id}&do=call`}>Call</Link>}
        </span> : <span className="pill">{STAGE_LABEL[c.status]}</span>}
        <span>{userName(m, c.ownerId)} · {d === 0 ? "today" : d + "d"}</span>
      </span>
    </li>
  );
}
