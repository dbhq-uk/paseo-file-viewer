import { readdir, stat, open } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import type { FileKind, FileEntry } from "../contracts.js";

const BY_EXTENSION: Record<string, FileKind> = {
  ".pdf": "pdf",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
  ".bmp": "image",
  ".svg": "image",
  ".avif": "image",
  ".docx": "document",
  ".xlsx": "sheet",
};

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".cache", ".next", "venv", ".venv", "__pycache__"]);
const MAX_FILES = 5000;

export function kindFor(path: string): FileKind | null {
  return BY_EXTENSION[extname(path).toLowerCase()] ?? null;
}

/** Legacy OLE2 container: .doc, .xls, .ppt. Recognised so it can be refused clearly. */
const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
/** OOXML is a zip. .docx and .xlsx both start PK\x03\x04. */
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export async function magicBytes(file: string, length = 8): Promise<Buffer> {
  const handle = await open(file, "r");
  try {
    const buf = Buffer.alloc(length);
    await handle.read(buf, 0, length, 0);
    return buf;
  } finally {
    await handle.close();
  }
}

/**
 * Confirms an Office file really is OOXML.
 *
 * A `.doc` renamed to `.docx` would otherwise fail deep inside mammoth with
 * an unreadable error; this turns it into a clear "unsupported format".
 */
export async function assertOoxml(file: string): Promise<void> {
  const head = await magicBytes(file);
  if (head.subarray(0, 8).equals(OLE2)) {
    throw new Error("Legacy Office format (.doc/.xls) is not supported - re-save as .docx or .xlsx");
  }
  if (!head.subarray(0, 4).equals(ZIP)) {
    throw new Error("File is not a valid Office document");
  }
}

export async function assertPdf(file: string): Promise<void> {
  const head = await magicBytes(file, 5);
  if (head.toString("latin1") !== "%PDF-") throw new Error("File is not a valid PDF");
}

/** Walks the workspace and returns every file the viewer can render. */
export async function scanWorkspace(root: string): Promise<FileEntry[]> {
  const found: FileEntry[] = [];

  async function walk(dir: string): Promise<void> {
    if (found.length >= MAX_FILES) return;
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory is skipped, not fatal
    }
    for (const item of items) {
      if (found.length >= MAX_FILES) return;
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        if (SKIP_DIRS.has(item.name) || item.name.startsWith(".")) continue;
        await walk(full);
      } else if (item.isFile()) {
        const kind = kindFor(item.name);
        if (!kind) continue;
        try {
          const info = await stat(full);
          found.push({
            relPath: relative(root, full),
            name: item.name,
            kind,
            sizeBytes: info.size,
            mtime: info.mtimeMs,
          });
        } catch {
          // vanished between readdir and stat
        }
      }
    }
  }

  await walk(root);
  found.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return found;
}
