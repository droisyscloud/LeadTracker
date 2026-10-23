"use client";
import { useEffect, useState } from "react";
/** Phones, tablets and the installed app (the same 900px switch the bottom bar uses). */
export function useMobile() {
  const [m, setM] = useState(false);
  useEffect(() => { const q = window.matchMedia("(max-width: 900px)"); const f = () => setM(q.matches); f(); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);
  return m;
}
