"use client";
import { createContext, useContext, useEffect, useState } from "react";

/** Any AI panel can be minimised to one line ("Show full" opens it again); remembered per panel on this device.
 *  The panel puts <FoldBtn /> in its own header row, so Minimise sits in line with its other buttons (Refresh, Get insights…). */
const Ctx = createContext<null | (() => void)>(null);
export function FoldBtn({ link }: { link?: boolean }) {
  const min = useContext(Ctx); if (!min) return null;
  return <button type="button" className={link ? "linkbtn small ai-fold-btn" : "btn sm ghost ai-fold-btn"} onClick={min} title="Minimise" aria-label="Minimise">– Minimise</button>;
}
export function AiFold({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const key = `ai-fold:${id}`; const [min, setMin] = useState(false);
  useEffect(() => { try { setMin(localStorage.getItem(key) === "1"); } catch { /* private mode */ } }, [key]);
  const set = (v: boolean) => { setMin(v); try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* private mode */ } };
  if (min) return <div className="panel ai-fold-min"><span>✨ {title}</span><button type="button" className="btn sm" onClick={() => set(false)} aria-label={`Show the full ${title}`}>Show full</button></div>;
  return <Ctx.Provider value={() => set(true)}>{children}</Ctx.Provider>;
}
