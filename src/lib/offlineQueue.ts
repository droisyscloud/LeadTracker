"use client";
/**
 * Leads captured on the phone are stored here (IndexedDB, on the device) until they reach the server.
 * Each one carries a reference so retrying never creates a duplicate lead.
 */
export type QueuedLead = { name: string; title: string; company: string; email: string; phone: string; productIds: string[]; eventId: string | null; rating: number; tags: string[] };
export type QueueItem = {
  id: string; kind: "lead" | "photo"; createdAt: number; status: "waiting" | "error"; error?: string;
  lead?: QueuedLead; note?: string; photos?: Blob[]; eventId?: string | null; contactIds?: string[]; noteDone?: boolean;
};
const DB = "leadtracker-offline", STORE = "queue";
const OLD_DB = "lead-tracker-offline"; // the app's previous name: leads still waiting there are moved across once
function openNew(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

/** Move leads still waiting in the old storage (from the app's previous name) into the new one, once. */
let moved: Promise<void> | null = null;
function moveOld(into: IDBDatabase): Promise<void> {
  return new Promise((done) => {
    const finish = () => done();
    try {
      const list = (indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> }).databases;
      const check = list ? list.call(indexedDB).then((dbs) => dbs.some((d) => d.name === OLD_DB)) : Promise.resolve(true);
      check.then((exists) => {
        if (!exists) return finish();
        const r = indexedDB.open(OLD_DB);
        r.onupgradeneeded = () => { r.transaction?.abort(); };   // it didn't exist: don't create it
        r.onerror = finish;
        r.onsuccess = () => {
          const old = r.result;
          if (!old.objectStoreNames.contains(STORE)) { old.close(); indexedDB.deleteDatabase(OLD_DB); return finish(); }
          const all = old.transaction(STORE, "readonly").objectStore(STORE).getAll();
          all.onerror = () => { old.close(); finish(); };   // leave the old one untouched if it can't be read
          all.onsuccess = () => {
            const items = all.result as unknown[];
            if (!items.length) { old.close(); indexedDB.deleteDatabase(OLD_DB); return finish(); }
            const tx = into.transaction(STORE, "readwrite"); const st = tx.objectStore(STORE);
            for (const it of items) st.put(it);
            tx.oncomplete = () => { old.close(); indexedDB.deleteDatabase(OLD_DB); finish(); };   // only removed once safely copied
            tx.onerror = () => { old.close(); finish(); };
          };
        };
      }).catch(finish);
    } catch { finish(); }
  });
}
async function open(): Promise<IDBDatabase> {
  const db = await openNew();
  if (!moved) moved = moveOld(db);
  await moved;
  return db;
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const r = fn(t.objectStore(STORE)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export const listQueue = async () => ((await tx<QueueItem[]>("readonly", (s) => s.getAll() as IDBRequest<QueueItem[]>)) || []).sort((a, b) => a.createdAt - b.createdAt);
export const putItem = (i: QueueItem) => tx("readwrite", (s) => s.put(i));
export const removeItem = (id: string) => tx("readwrite", (s) => s.delete(id));
export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

class Http extends Error { constructor(public status: number, msg: string) { super(msg); } }
async function call<T>(url: string, init: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, credentials: "same-origin" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Http(r.status, (j as { error?: string }).error || `Request failed (${r.status})`);
  return j as T;
}
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function createLead(l: Partial<QueuedLead> & { name: string }, ref: string): Promise<string> {
  const c = await call<{ id: string }>("/api/contacts", json({ name: l.name, title: l.title || "", company: l.company || "", email: l.email || "", phone: l.phone || "", productIds: l.productIds || [], tags: l.tags || [], eventId: l.eventId || null, source: "Booth", clientRef: ref }));
  if (l.rating) await call(`/api/contacts/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: l.rating }) }).catch(() => undefined);
  return c.id;
}
async function addNote(contactId: string, text: string, photos: Blob[] = []) {
  const fd = new FormData();
  fd.append("data", JSON.stringify({ contactId, type: "note", body: text }));
  photos.forEach((p, i) => fd.append("files", new File([p], `badge-${i + 1}.${p.type.includes("png") ? "png" : "jpg"}`, { type: p.type || "image/jpeg" })));
  await call("/api/activities", { method: "POST", body: fd });
}

/** Send everything waiting. Stops quietly when offline; keeps going past items the server rejected. */
export async function flushQueue(opts: { ai: boolean }): Promise<{ sent: number; left: number; signedOut?: boolean }> {
  let sent = 0;
  for (const it of await listQueue()) {
    try {
      if (it.kind === "lead" && it.lead) {
        if (!it.contactIds?.length) { it.contactIds = [await createLead(it.lead, it.id)]; await putItem(it); }
        if ((it.note?.trim() || it.photos?.length) && !it.noteDone) { await addNote(it.contactIds[0], it.note?.trim() || "Badge photo from Quick add.", it.photos || []); it.noteDone = true; await putItem(it); }
      } else if (it.kind === "photo") {
        const photos = it.photos || [];
        if (!it.contactIds?.length) {
          let people: QueuedLead[] = [];
          if (opts.ai) {
            const fd = new FormData(); photos.forEach((p, i) => fd.append("images", new File([p], `badge-${i + 1}.jpg`, { type: p.type || "image/jpeg" })));
            people = ((await call<{ leads: QueuedLead[] }>("/api/ai/scan", { method: "POST", body: fd })).leads || []);
          }
          const ids: string[] = [];
          if (people.length) for (let i = 0; i < people.length; i++) ids.push(await createLead({ ...people[i], eventId: it.eventId || null }, `${it.id}:${i}`));
          else ids.push(await createLead({ name: "Badge photo (add the details)", eventId: it.eventId || null, tags: ["Immediate follow-up"] }, it.id));
          it.contactIds = ids; await putItem(it);
        }
        if (!it.noteDone) { for (const id of it.contactIds) await addNote(id, it.note || "Captured from a badge photo on the phone.", photos); it.noteDone = true; await putItem(it); }
      }
      await removeItem(it.id); sent++;
    } catch (e) {
      if (e instanceof Http) {
        if (e.status === 401) return { sent, left: (await listQueue()).length, signedOut: true };
        it.status = "error"; it.error = e.message; await putItem(it); continue;
      }
      break; // network down: try again later
    }
  }
  return { sent, left: (await listQueue()).length };
}
