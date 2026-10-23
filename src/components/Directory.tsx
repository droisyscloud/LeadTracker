"use client";
import { useEffect, useState } from "react";
import type { ContactDTO, Stage } from "@/lib/types";
import { Icon } from "./ui";
import { STAGES } from "./model";

/** Shared pieces for the Contacts, Companies and Products directories. */
const hue = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
export const initials = (s: string) => s.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/** A colour tile with initials; the colour comes from the name, so it's always the same for the same name. */
export function Monogram({ name, size = 44, ring, square = false }: { name: string; size?: number; ring?: string; square?: boolean }) {
  const h = hue(name);
  return <span className={"mono" + (square ? " sq" : "")} aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.36,
    background: `linear-gradient(135deg,hsl(${h} 70% 58%),hsl(${(h + 40) % 360} 70% 46%))`, boxShadow: ring ? `0 0 0 2px var(--panel-solid),0 0 0 4px ${ring}` : undefined }}>{initials(name)}</span>;
}

/** Cards or list, remembered per page on this device. */
export function useViewMode(page: string): ["cards" | "list", (v: "cards" | "list") => void] {
  const [v, setV] = useState<"cards" | "list">("cards");
  useEffect(() => { try { const s = localStorage.getItem(`lt-view-${page}`); if (s === "list" || s === "cards") setV(s); } catch { /* ignore */ } }, [page]);
  return [v, (x) => { setV(x); try { localStorage.setItem(`lt-view-${page}`, x); } catch { /* ignore */ } }];
}
export function ViewToggle({ value, onChange }: { value: "cards" | "list"; onChange: (v: "cards" | "list") => void }) {
  return <div className="vt" role="group" aria-label="View as">
    <button type="button" aria-pressed={value === "cards"} onClick={() => onChange("cards")} title="Cards"><Icon name="board" size={16} /><span>Cards</span></button>
    <button type="button" aria-pressed={value === "list"} onClick={() => onChange("list")} title="List"><Icon name="list" size={16} /><span>List</span></button>
  </div>;
}

/** How far each person has got, as one thin bar of stage colours. */
export function StageMix({ people }: { people: Pick<ContactDTO, "status">[] }) {
  if (!people.length) return <div className="smix empty" />;
  const n = new Map<Stage, number>(); for (const p of people) n.set(p.status, (n.get(p.status) || 0) + 1);
  return <div className="smix" role="img" aria-label={STAGES.filter((s) => n.get(s[0])).map((s) => `${n.get(s[0])} ${s[1]}`).join(", ")}>
    {STAGES.filter((s) => n.get(s[0])).map((s) => <i key={s[0]} style={{ flex: n.get(s[0]), background: s[2] }} title={`${n.get(s[0])} ${s[1]}`} />)}
  </div>;
}
/** Overlapping initials for a few people, then "+N". */
export function PeopleStack({ names, max = 4 }: { names: string[]; max?: number }) {
  return <span className="pstack">{names.slice(0, max).map((n, i) => <Monogram key={i} name={n} size={24} />)}{names.length > max && <span className="more">+{names.length - max}</span>}</span>;
}
/** The page header: big count, tools on the right. */
export function DirHead({ count, noun, total, children }: { count: number; noun: string; total?: number; children: React.ReactNode }) {
  return <div className="dir-head">
    <div className="dir-count"><b className="num">{count}</b><span>{noun}{total !== undefined && total !== count ? ` of ${total}` : ""}</span></div>
    <div className="dir-tools">{children}</div>
  </div>;
}
