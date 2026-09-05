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
 *
 * A token pointing at a *public* store is refused outright — see
 * `privateStoreAvailable` below.
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

/**
 * A Vercel Blob store is created either public or private, and the choice is
 * fixed for the life of the store. A public store hands out permanent,
 * world-readable URLs — which is exactly what patient files must never have
 * (Rules §1.13). So the store is probed once, and if it turns out to be public
 * the token is refused: the bytes go to local storage and the go-live checklist
 * reports the problem, rather than a lab report quietly becoming a public URL.
 *
 * `null` means "not probed yet".
 */
let storeIsPrivate: boolean | null = null;
let probe: Promise<boolean> | null = null;

async function privateStoreAvailable(): Promise<boolean> {
  if (!hasBlobToken()) return false;
  if (storeIsPrivate !== null) return storeIsPrivate;
  probe ??= (async () => {
    const { put, del } = await import("@vercel/blob");
    const key = `.probe/${Date.now()}`;
    try {
      await put(key, Buffer.from("probe"), {
        access: "private",
        contentType: "text/plain",
        addRandomSuffix: false,
      });
      await del(key).catch(() => {});
      storeIsPrivate = true;
    } catch {
      // The store rejects private writes, so it is a public store.
      storeIsPrivate = false;
      console.error(
        "[files] The configured storage does not support private files, so it " +
          "will not be used. Patient files are being kept on this machine " +
          "instead. Create the store with private access and restart.",
      );
    }
    return storeIsPrivate;
  })();
  return probe;
}

/** True when the configured token points at a store that is unusable as-is. */
export async function storageMisconfigured(): Promise<boolean> {
  return hasBlobToken() && !(await privateStoreAvailable());
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
  if (await privateStoreAvailable()) {
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
  if (await privateStoreAvailable()) {
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
  if (await privateStoreAvailable()) {
    const { del } = await import("@vercel/blob");
    await del(key);
    return;
  }
  const path = localPathFor(key);
  await unlink(path).catch(() => {});
  await unlink(`${path}.type`).catch(() => {});
}

/** Where files are going, for the settings screen and the go-live checklist. */
export async function storageDescription(): Promise<string> {
  if (await privateStoreAvailable()) return "secure cloud storage";
  if (hasBlobToken()) {
    return "this computer — the cloud storage is set up to make files public, so it is not being used";
  }
  return "this computer — for development only";
}

/** Local-only helper so tests can point the store somewhere disposable. */
export function localStoreRoot(): string {
  return join(process.cwd(), ".filestore");
}
