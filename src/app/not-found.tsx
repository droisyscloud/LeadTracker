import Link from "next/link";
export default function NotFound() {
  return <div className="signin"><div className="panel card"><img className="logo" src="/api/public/brand/logo" alt="Logo" /><h1>Page not found</h1><p className="muted">That page does not exist.</p><Link className="btn primary" href="/home">Go to Home</Link></div></div>;
}
