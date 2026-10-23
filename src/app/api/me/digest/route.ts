import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { mailConfigured } from "@/lib/config";
import { runDigests } from "@/lib/digest";
export const POST = route(async () => {
  const me = await requireUser("viewer");
  if (!mailConfigured()) throw new HttpError(501, "Email is not configured on this server.");
  await runDigests({ userId: me.id });
  return ok({ sent: true });
});
