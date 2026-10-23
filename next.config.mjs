/** @type {import('next').NextConfig} */
// Render sets RENDER=true while building. There the code is already checked before each release (type check + the
// full regression), so the build skips repeating the type check, and skips the standalone bundle Render never uses
// (the Dockerfile still gets it). Both cut the build's time and, above all, its memory on small Render plans.
const onRender = !!process.env.RENDER;
const nextConfig = {
  env: { NEXT_PUBLIC_BUILT_AT: new Date().toISOString() },
  ...(onRender ? {} : { output: "standalone" }),
  typescript: { ignoreBuildErrors: onRender },
  // on Render, build with one worker at a time so the build fits in a small plan's memory
  ...(onRender ? { experimental: { cpus: 1, webpackMemoryOptimizations: true, workerThreads: false } } : {}),
  poweredByHeader: false,
  serverExternalPackages: ["postgres", "nodemailer"],
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
      ],
    }, {
      // the offline helper must always be fresh so updates reach phones quickly
      source: "/sw.js",
      headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }],
    }];
  },
};
export default nextConfig;
