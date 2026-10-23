"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { api, useData } from "../data";
import { Panel } from "../ui";
import { ago } from "../model";

type Info = { publicKey: string; devices: { id: string; device: string; endpoint: string; createdAt: number; lastSentAt: number | null }[] };
const b64ToBytes = (s: string) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
const deviceName = () => { const u = navigator.userAgent; const os = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Mac/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : "This device";
  const br = /Edg\//.test(u) ? "Edge" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : /Firefox\//.test(u) ? "Firefox" : ""; return br ? `${os}, ${br}` : os; };

/** Turn phone (and computer) notifications on or off for this device. */
export function PushSettings() {
  const { run, toast } = useData();
  const { data, mutate } = useSWR<Info>("/api/push", (u: string) => api<Info>(u));
  const [support, setSupport] = useState<"ok" | "ios-install" | "none" | "denied">("ok"); const [mine, setMine] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const ios = /iPhone|iPad/.test(navigator.userAgent); const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) setSupport(ios && !standalone ? "ios-install" : "none");
    else if (Notification.permission === "denied") setSupport("denied");
    navigator.serviceWorker?.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => setMine(s?.endpoint || null)).catch(() => undefined);
  }, []);
  const on = async () => {
    if (!data) return; setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setSupport(perm === "denied" ? "denied" : "ok"); toast("Notifications weren't allowed.", "error"); return; }
      const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.publicKey) }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      if (await run(() => api("/api/push", { json: { endpoint: j.endpoint, keys: j.keys, device: deviceName() } }), "Notifications are on for this device")) { setMine(j.endpoint); mutate(); }
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't turn notifications on.", "error"); }
    finally { setBusy(false); }
  };
  const off = async (id: string, endpoint: string) => {
    if (endpoint === mine) { const reg = await navigator.serviceWorker.getRegistration(); await (await reg?.pushManager.getSubscription())?.unsubscribe().catch(() => undefined); setMine(null); }
    await run(() => api(`/api/push?id=${id}`, { method: "DELETE" }), "Notifications turned off for that device"); mutate();
  };
  return <Panel className="s12" title="Phone notifications" sub="Get an alert on your phone or computer when a lead replies, someone books a meeting with you, you're given or tagged on a task, you're mentioned, or a task is due.">
    <div className="form">
      {support === "ios-install" && <div className="banner" style={{ margin: 0 }}><b>On iPhone and iPad:</b> first add the app to your home screen (in Safari tap Share, then Add to Home Screen), open it from there, and come back to this page. Needs iOS 16.4 or later.</div>}
      {support === "none" && <p className="small muted" style={{ margin: 0 }}>This browser can't receive notifications. Try Chrome, Edge, Firefox or Safari.</p>}
      {support === "denied" && <div className="banner" style={{ margin: 0 }}>Notifications are blocked for this site. Allow them in your browser or phone settings, then reload this page.</div>}
      {support === "ok" && <div className="btns">{mine && data?.devices.some((d) => d.endpoint === mine)
        ? <><span className="pill" style={{ background: "var(--warm-soft, var(--chip))" }}>On for this device</span><button className="btn" onClick={() => run(() => api("/api/push/test", { json: {} }), "Test sent. It should appear in a few seconds.")}>Send a test</button></>
        : <button className="btn primary" disabled={busy || !data} onClick={on}>{busy ? "Turning on…" : "Turn on for this device"}</button>}</div>}
      {data && data.devices.length > 0 && <table className="tbl"><thead><tr><th>Device</th><th>Turned on</th><th>Last alert</th><th /></tr></thead>
        <tbody>{data.devices.map((d) => <tr key={d.id}><td>{d.device || "Device"}{d.endpoint === mine && <span className="small muted"> (this one)</span>}</td><td className="small muted">{ago(d.createdAt)}</td><td className="small muted">{d.lastSentAt ? ago(d.lastSentAt) : "none yet"}</td>
          <td className="n"><button className="linkbtn" onClick={() => off(d.id, d.endpoint)}>Turn off</button></td></tr>)}</tbody></table>}
    </div>
  </Panel>;
}
