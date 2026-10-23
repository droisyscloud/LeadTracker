import { schema } from "@/db";
import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { updateById } from "../../_crud";
export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep"); const { id } = await params;
  await updateById(schema.enrollments, id, { status: "stopped", stoppedReason: `Stopped by ${me.name || me.email}`, nextAt: null });
  return ok({ stopped: true });
});
