import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { pushTo } from "@/lib/push";
import { appName } from "@/lib/brand";

export const POST = route(async () => {
  const me = await requireUser("viewer");
  const n = await pushTo([me.id], { title: appName(), body: "Notifications are working on this device.", url: "/home", tag: "test" });
  if (!n) throw new HttpError(400, "No devices have notifications turned on yet.");
  return ok({ sent: n });
});
