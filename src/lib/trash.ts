import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteFile } from "./storage";

/**
 * Recycle bin. Before something is deleted, take a snapshot of it and of every row the database would remove
 * with it (following ON DELETE CASCADE), plus the links it would cut (ON DELETE SET NULL). Restoring puts the
 * rows back with the same ids (parents first) and re-links what pointed at them. Files stay in storage until
 * the snapshot is purged.
 */
type Fk = { child: string; column: string; parent: string; pcol: string; rule: string; nullable: boolean };
let fkCache: Fk[] | null = null;
async function fks(): Promise<Fk[]> {
  if (fkCache) return fkCache;
  const r = await db.execute(sql`
    SELECT tc.table_name AS child, kcu.column_name AS column, ccu.table_name AS parent, ccu.column_name AS pcol, rc.delete_rule AS rule,
           (c.is_nullable = 'YES') AS nullable
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
    JOIN information_schema.columns c ON c.table_name = tc.table_name AND c.column_name = kcu.column_name AND c.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`);
  fkCache = (r as unknown as Fk[]); return fkCache;
}
const ident = (s: string) => sql.raw(`"${s.replace(/"/g, "")}"`);

type Snap = { rows: { table: string; data: Record<string, unknown>[] }[]; links: { table: string; column: string; ids: string[]; value: string }[] };
/** Snapshot rows of `table` where `column` is one of `values`, and everything that depends on them. */
async function collect(table: string, column: string, values: string[], snap: Snap, seen: Set<string>) {
  if (!values.length) return;
  const r = await db.execute(sql`SELECT to_jsonb(t) AS j FROM ${ident(table)} t WHERE ${ident(column)}::text IN (${sql.join(values.map((v) => sql`${v}`), sql`, `)})`);
  const rows = (r as unknown as { j: Record<string, unknown> }[]).map((x) => x.j).filter((row) => { const k = `${table}:${JSON.stringify(row.id ?? row)}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (!rows.length) return;
  snap.rows.push({ table, data: rows });
  for (const fk of (await fks()).filter((f) => f.parent === table)) {
    const parentVals = [...new Set(rows.map((row) => row[fk.pcol]).filter((v) => v !== null && v !== undefined).map(String))];
    if (!parentVals.length) continue;
    if (fk.rule === "CASCADE") await collect(fk.child, fk.column, parentVals, snap, seen);
    else if (fk.rule === "SET NULL") {
      for (const pv of parentVals) {
        const c = await db.execute(sql`SELECT id::text AS id FROM ${ident(fk.child)} WHERE ${ident(fk.column)}::text = ${pv}`);
        const ids = (c as unknown as { id: string }[]).map((x) => x.id);
        if (ids.length) snap.links.push({ table: fk.child, column: fk.column, ids, value: pv });
      }
    }
  }
}

/** Move something to the recycle bin: snapshot, then delete (the database removes what depends on it). */
export async function moveToTrash(kind: string, table: string, id: string, label: string, detail: string, actorId: string) {
  const snap: Snap = { rows: [], links: [] };
  await collect(table, "id", [id], snap, new Set());
  const fileKeys: string[] = [];
  for (const part of snap.rows) if (part.table === "files" || part.table === "email_attachments") for (const row of part.data) if (row.storage_key) fileKeys.push(String(row.storage_key));
  for (const part of snap.rows) for (const row of part.data) if (row.file_key) fileKeys.push(String(row.file_key));   // PDFs and documents: kept until the bin is emptied
  const [t] = await db.insert(schema.trash).values({ kind, entityId: id, label: label.slice(0, 300), detail: detail.slice(0, 300), snapshot: snap, fileKeys, deletedById: actorId }).returning();
  await db.execute(sql`DELETE FROM ${ident(table)} WHERE id::text = ${id}`);
  return t;
}

/** Put it all back: parents first, same ids; links to things deleted since are left empty; cut links restored. */
export async function restoreFromTrash(trashId: string) {
  const [t] = await db.select().from(schema.trash).where(sql`${schema.trash.id} = ${trashId}`).limit(1);
  if (!t) return null;
  const all = await fks();
  await db.transaction(async (tx) => {
    for (const part of t.snapshot.rows) {
      const tmp = `restore_${part.table}`;
      await tx.execute(sql`CREATE TEMP TABLE ${ident(tmp)} ON COMMIT DROP AS SELECT * FROM jsonb_populate_recordset(NULL::${ident(part.table)}, ${JSON.stringify(part.data)}::jsonb)`);
      for (const fk of all.filter((f) => f.child === part.table && f.nullable)) {
        await tx.execute(sql`UPDATE ${ident(tmp)} SET ${ident(fk.column)} = NULL WHERE ${ident(fk.column)} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${ident(fk.parent)} p WHERE p.${ident(fk.pcol)} = ${ident(tmp)}.${ident(fk.column)})`);
      }
      await tx.execute(sql`INSERT INTO ${ident(part.table)} SELECT * FROM ${ident(tmp)} ON CONFLICT DO NOTHING`);
      await tx.execute(sql`DROP TABLE ${ident(tmp)}`);
    }
    for (const l of t.snapshot.links) {
      await tx.execute(sql`UPDATE ${ident(l.table)} SET ${ident(l.column)} = ${l.value}::uuid WHERE id::text IN (${sql.join(l.ids.map((v) => sql`${v}`), sql`, `)}) AND ${ident(l.column)} IS NULL`);
    }
    await tx.delete(schema.trash).where(sql`${schema.trash.id} = ${trashId}`);
  });
  return t;
}

/** Empty it for good: files from storage, then the snapshot. */
export async function purgeTrash(trashId: string) {
  const [t] = await db.select().from(schema.trash).where(sql`${schema.trash.id} = ${trashId}`).limit(1);
  if (!t) return false;
  await Promise.all(t.fileKeys.map((k) => deleteFile(k).catch(() => undefined)));
  await db.delete(schema.trash).where(sql`${schema.trash.id} = ${trashId}`);
  return true;
}
/** Daily: anything in the bin for more than 30 days is removed for good. */
export async function runTrashPurge() {
  const old = await db.select({ id: schema.trash.id }).from(schema.trash).where(sql`${schema.trash.deletedAt} < now() - interval '30 days'`);
  for (const o of old) await purgeTrash(o.id);
  return { purged: old.length };
}
