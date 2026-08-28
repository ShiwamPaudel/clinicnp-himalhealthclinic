/**
 * file-store.ts — where a patient file's bytes actually live. Server only.
 *
 * Production uses Vercel Blob with `access: 'private'`, so a blob URL is
 * useless without authentication (Rules §1.13). Reading and writing both go
 * through this module; the client never touches storage and never sees a key.
 *
 * When BLOB_READ_WRITE_TOKEN is absent — local development and the test suite —
 * the bytes go to a folder under .filestore instead. That folder is gitignored
 * and is never used when a token is present. It exists so the upload/serve path
 * can be exercised end to end without provisioning a store; it is NOT a second
 * storage backend for production.
 */
import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface StoredFile {
  body: Uint8Array;
  contentType: string;
  size: number;
}

function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Local fallback root. Kept outside `public/` so nothing is ever served statically. */
function localPathFor(key: string): string {
  const root = resolve(process.cwd(), ".filestore");
  // Keys are built by lib/files.ts, never by user input, but normalise anyway
  // so a crafted key can't climb out of the store.
  const target = resolve(root, key);
  if (!target.startsWith(root)) throw new Error("bad storage key");
  return target;
}

export async function putFile(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  if (hasBlobToken()) {
    const { put } = await import("@vercel/blob");
    await put(key, Buffer.from(body), {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }

  const path = localPathFor(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  await writeFile(`${path}.type`, contentType, "utf8");
}

export async function getFile(key: string): Promise<StoredFile | null> {
  if (hasBlobToken()) {
    const { get } = await import("@vercel/blob");
    const res = await get(key, { access: "private" });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const buf = new Uint8Array(await new Response(res.stream).arrayBuffer());
    return {
      body: buf,
      contentType: res.blob.contentType ?? "application/octet-stream",
      size: res.blob.size ?? buf.byteLength,
    };
  }

  try {
    const path = localPathFor(key);
    const body = new Uint8Array(await readFile(path));
    let contentType = "application/octet-stream";
    try {
      contentType = (await readFile(`${path}.type`, "utf8")).trim();
    } catch {
      // type sidecar missing — fall back to the generic type
    }
    return { body, contentType, size: body.byteLength };
  } catch {
    return null;
  }
}

export async function deleteFile(key: string): Promise<void> {
  if (hasBlobToken()) {
    const { del } = await import("@vercel/blob");
    await del(key);
    return;
  }
  const path = localPathFor(key);
  await unlink(path).catch(() => {});
  await unlink(`${path}.type`).catch(() => {});
}

/** Where files are going, for the settings screen and the go-live checklist. */
export function storageDescription(): string {
  return hasBlobToken() ? "Vercel Blob (private)" : "this machine (development)";
}

/** Local-only helper so tests can point the store somewhere disposable. */
export function localStoreRoot(): string {
  return join(process.cwd(), ".filestore");
}
