import { ok, route } from "@/lib/http";
import { requireAccountingUser } from "@/lib/collectionsAccess";
import { syncQuickBooks } from "@/lib/qbo";

export const POST = route(async () => { await requireAccountingUser(); return ok(await syncQuickBooks()); });
