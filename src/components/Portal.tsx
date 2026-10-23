"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Renders a pop-up at the end of the page, so a form opened from inside another form is not nested in it. */
export function Portal({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}
