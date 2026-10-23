import { z } from "zod";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { checkPassword, noteFailure, passwordEnabled, tooManyTries, passwordProblem, setPassword, storedHash, usePasswordLinks } from "@/lib/password";

const input = z.object({ current: z.string().max(200).default(""), next: z.string().max(200) });

/** Change your own password (email and password sign-in). */
export const POST = route(async (req: Request) => {
  const me = await requireUser("viewer");
  if (!passwordEnabled()) throw new HttpError(400, "Email and password sign-in is not turned on for this app.");
  const d = await body(req, input);
  const hash = await storedHash(me.id);
  if (tooManyTries(me.email, "account")) throw new HttpError(429, "Too many tries. Wait 15 minutes and try again.");
  if (hash && !(await checkPassword(d.current, hash))) { noteFailure(me.email, "account"); throw new HttpError(400, "Your current password isn't right."); }
  const problem = passwordProblem(d.next, me.email);
  if (problem) throw new HttpError(400, problem);
  await setPassword(me.id, d.next);
  await usePasswordLinks(me.id);
  await audit(me.id, "user.password_set", "user", me.id, { via: "account" });
  return ok({ saved: true });
});
