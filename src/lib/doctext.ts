/** Plain text from an uploaded document (PDF, Word .docx, or text), for AI to read. */
export async function documentText(buf: Buffer, contentType: string, name: string): Promise<string> {
  const ext = name.toLowerCase().split(".").pop() || "";
  if (contentType === "application/pdf" || ext === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text || "");
  }
  if (ext === "docx" || contentType.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: buf })).value;
  }
  if (contentType.startsWith("text/") || ["txt", "md"].includes(ext)) return buf.toString("utf8");
  throw new Error("unsupported");
}
