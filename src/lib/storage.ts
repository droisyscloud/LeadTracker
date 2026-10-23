import { randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const useS3 = () => !!process.env.S3_BUCKET;
let s3: S3Client | null = null;
function client() {
  if (!s3) s3 = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: process.env.S3_ACCESS_KEY_ID ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "" } : undefined,
  });
  return s3;
}
const localDir = () => path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || "./data/uploads");

export async function putFile(buf: Buffer, contentType: string): Promise<string> {
  const key = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}`;
  if (useS3()) {
    await client().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: buf, ContentType: contentType }));
  } else {
    const p = path.join(/* turbopackIgnore: true */ localDir(), key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, buf);
  }
  return key;
}
export async function getFile(key: string): Promise<Buffer> {
  if (useS3()) {
    const r = await client().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  const p = path.join(/* turbopackIgnore: true */ localDir(), key);
  if (!p.startsWith(localDir())) throw new Error("bad key");
  return readFile(p);
}
export async function deleteFile(key: string) {
  try {
    if (useS3()) await client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    else await unlink(path.join(/* turbopackIgnore: true */ localDir(), key));
  } catch (e) { console.error("delete file failed", key, e); }
}
