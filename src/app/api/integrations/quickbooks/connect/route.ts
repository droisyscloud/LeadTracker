import { cookies } from "next/headers";
import { HttpError, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { authorizeUrl, qboConfigured } from "@/lib/qbo";

/** Start connecting QuickBooks (admins). */
export const GET = route(async () => {
  await requireUser("admin");
  if (!qboConfigured()) throw new HttpError(501, "QuickBooks isn't set up on the server yet (QBO_CLIENT_ID and QBO_CLIENT_SECRET). See the setup guide.");
  const { url, state } = authorizeUrl();
  (await cookies()).set("qbo_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return Response.redirect(url, 302);
});
