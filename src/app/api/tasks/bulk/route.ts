import { z } from "zod";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { callRoute } from "@/lib/selfCall";
import { DELETE as DELETE_ONE, PATCH as PATCH_ONE } from "../[id]/route";

/** Mark several tasks done, or delete them, at once. Each goes through the normal rules (you can only change what you may). */
export const POST = route(async (req: Request) => {
  await requireUser("viewer");
  const d = await body(req, z.object({ ids: z.array(z.string().uuid()).min(1).max(500), action: z.enum(["done", "delete"]) }));
  let done = 0; const failed: string[] = [];
  for (const id of d.ids) {
    const r = d.action === "delete" ? await callRoute(DELETE_ONE, req, "DELETE", { params: { id } }) : await callRoute(PATCH_ONE, req, "PATCH", { params: { id }, json: { status: "done" } });
    if (r.ok) done++; else failed.push(id);
  }
  return ok({ done, failed });
});
