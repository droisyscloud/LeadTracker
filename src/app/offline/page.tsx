export const metadata = { title: "Offline" };
/** Shown when a page can't be loaded without a connection. Quick add keeps working. */
export default function Offline() {
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", fontFamily: "Arial, sans-serif", background: "#070F1F", color: "#E8EEF9" }}>
    <div style={{ maxWidth: 420 }}>
      <img src="/icons/icon-192.png" alt="" width={72} height={72} style={{ borderRadius: 16 }} />
      <h1 style={{ fontSize: "1.4rem" }}>You're offline</h1>
      <p style={{ color: "#8798B8" }}>This page needs a connection. You can still add leads and photograph badges: they're kept on your phone and sent automatically when you're back online.</p>
      <p><a href="/quick" style={{ display: "inline-block", background: "#4C8DF0", color: "#fff", padding: "12px 20px", borderRadius: 12, textDecoration: "none", fontWeight: 700 }}>Open Quick add</a></p>
    </div>
  </main>;
}
