import type { Metadata, Viewport } from "next";
import "@fontsource-variable/sora";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./theme.css";
import { appName, company, customLogo, DEFAULT_COMPANY_NAME } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const app = appName(); const us = await company();
  return { title: us.name === DEFAULT_COMPANY_NAME ? app : `${app} | ${us.name}`, description: "Event lead tracking, follow-ups and team metrics.", robots: { index: false, follow: false },
    applicationName: app, appleWebApp: { capable: true, title: app, statusBarStyle: "black-translucent" } };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#EDF1F8" };

const themeScript = `try{var t=localStorage.getItem('lt-theme');if(t!=='auto')document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')}catch(e){document.documentElement.setAttribute('data-theme','light')}`;   // light unless you chose dark or Auto

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const own = { logo: !!(await customLogo("logo")), mark: !!(await customLogo("mark")) };
  return (
    <html lang="en" suppressHydrationWarning data-own-logo={own.logo ? "1" : undefined} data-own-mark={own.mark ? "1" : undefined}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Carlito:wght@400;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
