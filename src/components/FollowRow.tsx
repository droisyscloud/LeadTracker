"use client";
import Link from "next/link";
import type { ContactDTO } from "@/lib/types";
import { Icon } from "./ui";
import { ago, coName, daysSince, heatColor, lastTouch, prodNames, STAGE_LABEL, userName, type Model } from "./model";
import { api, useData } from "./data";
import { todayStr } from "./model";

/** How urgent the reason is, so it can be coloured: overdue and never-contacted stand out, scheduled ones are calm. */
const tone = (reason: string) => /overdue|not contacted|no touch|cold/i.test(reason) ? "hot" : /today/i.test(reason) ? "warm" : "calm";

/**
 * One lead waiting for follow-up. Same size everywhere (Home and Follow-ups): name and rating, title and company,
 * why it's due, then stage, owner and last touch, with one-tap email and call.
 */
export function FollowRow({ m, c, reason, selected, onToggle }: { m: Model; c: ContactDTO; reason: string; selected?: boolean; onToggle?: () => void }) {
  const { run, perms } = useData();
  const d = daysSince(m, c); const co = coName(m, c); const prods = prodNames(m, c);
  return <li className={"fr" + (onToggle ? " selecting" : "")}>
    {onToggle && <input type="checkbox" className="sel-box" checked={!!selected} onChange={onToggle} aria-label={`Select ${c.name}`} />}
    <span className="heat" style={{ background: heatColor(m, c) }} title={"Last touch " + ago(lastTouch(m, c))} />
    <Link href={`/contacts?id=${c.id}`} className="fr-main">
      <span className="fr-top"><b className="fr-name">{c.name}</b>{c.rating > 0 && <span className="fr-stars" aria-label={`${c.rating} stars`}>{"★".repeat(c.rating)}</span>}</span>
      <span className="fr-sub">{[c.title, co].filter(Boolean).join(", ") || "No company yet"}{prods.length > 0 && <span className="fr-prod"> · {prods.join(", ")}</span>}</span>
      <span className={"fr-why " + tone(reason)}>{reason}</span>
    </Link>
    <span className="fr-side">
      <span className="fr-act">
        <span className="pill">{STAGE_LABEL[c.status]}</span>
        {c.email && <Link className="fr-ic" href={`/contacts?id=${c.id}&do=email`} title={`Email ${c.email}`} aria-label={`Email ${c.name}`}><Icon name="mail" size={15} /></Link>}
        {c.phone && <Link className="fr-ic" href={`/contacts?id=${c.id}&do=call`} title={`Call ${c.phone}`} aria-label={`Call ${c.name}`}><Icon name="phone" size={15} /></Link>}
        {perms.write && <button type="button" className="fr-ic fr-dis" title="Remove this follow-up" aria-label={`Remove follow-up for ${c.name}`} onClick={() => run(() => api(`/api/contacts/${c.id}/followup-dismiss`, { method: "POST" }), `Follow-up for ${c.name} removed for you. Colleagues still see it; a new follow-up date brings it back.`)}>✕</button>}
      </span>
      <span className="fr-meta">{userName(m, c.ownerId)} · {d === 0 ? "today" : `${d}d ago`}</span>
    </span>
  </li>;
}
