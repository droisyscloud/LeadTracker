/* Lead Tracker offline helper.
   - App files are cached so the app opens without a connection.
   - Quick add (/quick) works offline; leads added there are kept on the phone and sent when back online.
   - Data requests (/api) always go to the server; nothing private is cached. */
const VERSION = "lt-v5-demo2";
const SHELL = ["/quick", "/offline", "/icons/icon-192.png", "/icons/icon-512.png", "/logo-mark.png", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) =>
    fetch(u, { credentials: "include" }).then((r) => (r.ok && !r.redirected ? c.put(u, r) : undefined)).catch(() => undefined)))));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/book/")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; })));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => {
      if (r.ok && !r.redirected && url.pathname === "/quick") { const copy = r.clone(); caches.open(VERSION).then((c) => c.put("/quick", copy)); }
      return r;
    }).catch(async () => (url.pathname === "/quick" ? await caches.match("/quick") : null) || (await caches.match("/offline")) || new Response("You're offline.", { headers: { "Content-Type": "text/plain" } })));
  }
});
self.addEventListener("message", (e) => { if (e.data === "skip-waiting") self.skipWaiting(); });

/* Push notifications: show them, and open the right page when tapped. */
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Notification", { body: d.body || "", icon: d.icon || "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: d.tag || undefined, data: { url: d.url || "/home" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/home", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.location.origin) && "focus" in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
