"use client";
import { Fragment } from "react";

/** Show text with web addresses and email addresses as links (web links open in a new tab). */
const TLD = "com|net|org|io|app|ai|co|dev|us|uk|in|ca|au|de|info|biz|gg|me|tv|xyz|cloud|tech|site|online|store|agency|solutions|services|vegas|casino|games|mo|hk|sg|vn|ph|jp";
const RX = new RegExp(`(\\bhttps?:\\/\\/[^\\s<>"')\\]]+|\\b[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+\\b|\\bwww\\.[^\\s<>"')\\]]+\\.[^\\s<>"')\\]]+|\\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLD})\\b(?:\\/[^\\s<>"')\\]]*)?)`, "gi");
export function Linkify({ text }: { text: string | null | undefined }) {
  if (!text) return null; const out: React.ReactNode[] = []; let last = 0; let k = 0;
  for (const m of text.matchAll(RX)) {
    let s = m[0]; const end = s.match(/[.,;:!?]+$/); if (end) s = s.slice(0, -end[0].length); const at = m.index ?? 0;
    if (at > last) out.push(<Fragment key={k++}>{text.slice(last, at)}</Fragment>);
    const email = s.includes("@") && !/^https?:|^www\./i.test(s); const href = email ? `mailto:${s}` : /^https?:/i.test(s) ? s : `https://${s}`;
    out.push(<a key={k++} href={href} className="colink" {...(email ? {} : { target: "_blank", rel: "noreferrer noopener" })} onClick={(e) => e.stopPropagation()}>{s}</a>);
    last = at + s.length;
  }
  if (last < text.length) out.push(<Fragment key={k++}>{text.slice(last)}</Fragment>);
  return <>{out}</>;
}
