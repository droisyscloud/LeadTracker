/** A note on a contact's timeline (the same as adding a note on the contact). */
export async function addTimelineNote(contactId: string, body: string) {
  const fd = new FormData(); fd.append("data", JSON.stringify({ contactId, type: "note", body }));
  const r = await fetch("/api/activities", { method: "POST", body: fd }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't save the note.");
}
