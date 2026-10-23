import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { bootstrapFor } from "@/lib/bootstrapData";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const me = await requireUser("viewer");
  return ok(await bootstrapFor(me));
});
