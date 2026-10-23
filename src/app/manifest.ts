import type { MetadataRoute } from "next";
import { appName } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** Lets people install the app on their phone's home screen and open it like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appName(), short_name: appName().slice(0, 12), description: "Leads, follow-ups, deals and team metrics in one place.",
    start_url: "/home", scope: "/", display: "standalone", orientation: "portrait",
    background_color: "#EDF1F8", theme_color: "#EDF1F8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Quick add a lead", short_name: "Quick add", url: "/quick", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Follow-ups due", short_name: "Follow-ups", url: "/followups", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
