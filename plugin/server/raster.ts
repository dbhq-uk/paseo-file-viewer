import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile, readdir, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { assertPdf } from "./scan.js";

const run = promisify(execFile);
const TIMEOUT_MS = 30_000;
const CACHE_DIR = join(tmpdir(), "paseo-file-viewer");
const CACHE_LIMIT_BYTES = 500 * 1024 * 1024;

/** Formats React Native can display directly, so no conversion step is needed. */
const NATIVE_IMAGE = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
};

/** 150 DPI is the 100% baseline; the zoom control moves DPI, not the image. */
const BASE_DPI = 150;

async function exec(cmd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await run(cmd, args, { timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new Error(`Missing tool: ${cmd}. Install poppler-utils, librsvg2-bin and imagemagick`);
    if (err?.killed) throw new Error(`${cmd} timed out after ${TIMEOUT_MS / 1000}s`);
    throw new Error(err?.stderr?.toString().trim() || err?.message || `${cmd} failed`);
  }
}

function cacheKey(file: string, mtimeMs: number, size: number, page: number, dpi: number): string {
  return createHash("sha256")
    .update([file, mtimeMs, size, page, dpi].join("\0"))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Evicts least-recently-used entries once the cache exceeds its limit.
 * Called after a write, and failures are ignored - a full cache is a
 * performance problem, not a reason to fail the render.
 */
async function evict(): Promise<void> {
  try {
    const names = await readdir(CACHE_DIR);
    const entries = await Promise.all(
      names.map(async (n) => {
        const p = join(CACHE_DIR, n);
        const s = await stat(p);
        return { path: p, size: s.size, atime: s.atimeMs };
      }),
    );
    let total = entries.reduce((sum, e) => sum + e.size, 0);
    if (total <= CACHE_LIMIT_BYTES) return;
    entries.sort((a, b) => a.atime - b.atime);
    for (const e of entries) {
      if (total <= CACHE_LIMIT_BYTES) break;
      await unlink(e.path).catch(() => {});
      total -= e.size;
    }
  } catch {
    // cache maintenance is best-effort
  }
}

export interface PageInfo {
  pages: number;
  width: number;
  height: number;
}

export async function pdfInfo(file: string): Promise<PageInfo> {
  await assertPdf(file);
  const out = await exec("pdfinfo", [file]);
  const pages = Number(/^Pages:\s+(\d+)/m.exec(out)?.[1] ?? 0);
  const size = /^Page size:\s+([\d.]+) x ([\d.]+)/m.exec(out);
  if (!pages) throw new Error("Could not read the PDF - it may be encrypted or corrupt");
  return {
    pages,
    width: Math.round((Number(size?.[1] ?? 595) / 72) * BASE_DPI),
    height: Math.round((Number(size?.[2] ?? 842) / 72) * BASE_DPI),
  };
}

export async function imageInfo(file: string): Promise<PageInfo> {
  const out = await exec("identify", ["-format", "%w %h", `${file}[0]`]);
  const [w, h] = out.trim().split(/\s+/).map(Number);
  if (!w || !h) throw new Error("Could not read the image dimensions");
  return { pages: 1, width: w, height: h };
}

export interface RenderedPage {
  dataUri: string;
  width: number;
  height: number;
}

/**
 * Renders one page as a PNG data URI, caching the result on disk.
 *
 * The cache key includes mtime and size, so editing a file invalidates its
 * pages without any filesystem watching.
 */
export async function renderPage(
  file: string,
  kind: "pdf" | "image",
  page: number,
  dpi: number,
): Promise<RenderedPage> {
  const info = await stat(file);
  const key = cacheKey(file, info.mtimeMs, info.size, page, dpi);
  await mkdir(CACHE_DIR, { recursive: true });
  const cached = join(CACHE_DIR, `${key}.png`);

  let bytes: Buffer;
  let mime = "image/png";

  try {
    bytes = await readFile(cached);
  } catch {
    if (kind === "pdf") {
      const prefix = join(CACHE_DIR, key);
      await exec("pdftoppm", ["-png", "-r", String(dpi), "-f", String(page), "-l", String(page), "-singlefile", file, prefix]);
      bytes = await readFile(cached);
    } else {
      const ext = extname(file).toLowerCase();
      const scale = dpi / BASE_DPI;
      if (ext === ".svg") {
        await exec("rsvg-convert", ["-z", String(scale), "-o", cached, file]);
        bytes = await readFile(cached);
      } else if (ext === ".avif" || scale !== 1) {
        await exec("convert", [`${file}[0]`, "-resize", `${Math.round(scale * 100)}%`, cached]);
        bytes = await readFile(cached);
      } else if (NATIVE_IMAGE.has(ext)) {
        // Already displayable at 100%, so ship the original bytes untouched.
        bytes = await readFile(file);
        mime = MIME[ext] ?? "image/png";
        await writeFile(cached, bytes).catch(() => {});
      } else {
        await exec("convert", [`${file}[0]`, cached]);
        bytes = await readFile(cached);
      }
    }
    void evict();
  }

  const dims = kind === "pdf"
    ? await exec("identify", ["-format", "%w %h", cached]).then((o) => o.trim().split(/\s+/).map(Number))
    : null;

  return {
    dataUri: `data:${mime};base64,${bytes.toString("base64")}`,
    width: dims?.[0] ?? 0,
    height: dims?.[1] ?? 0,
  };
}
