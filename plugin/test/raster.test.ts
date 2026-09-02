import assert from "node:assert/strict";
import { copyFile, utimes, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { imageInfo, pdfInfo, renderPage } from "../server/raster.js";

/**
 * AVIF needs an ImageMagick built with libheif, which many CI images lack.
 * The test is skipped rather than failed there, so a missing delegate does not
 * masquerade as a broken renderer.
 */
function hasAvif(): boolean {
  try {
    return /^\s+AVIF\s+r/m.test(execFileSync("convert", ["-list", "format"], { encoding: "utf8" }));
  } catch {
    return false;
  }
}

const fixtures = new URL("./fixtures/", import.meta.url).pathname;
const at = (name: string) => join(fixtures, name);

describe("pdfInfo", () => {
  it("reports the page count and page size", async () => {
    const info = await pdfInfo(at("statement.pdf"));
    assert.equal(info.pages, 3);
    assert.ok(info.width > 1000 && info.height > 1500, `unexpected size ${info.width}x${info.height}`);
  });

  it("refuses a file that is not a PDF", async () => {
    await assert.rejects(() => pdfInfo(at("contract.docx")), /not a valid PDF/);
  });

  it("fails on a truncated PDF rather than reporting nonsense", async () => {
    await assert.rejects(() => pdfInfo(at("truncated.pdf")));
  });

  it("reports an encrypted PDF as unreadable", async () => {
    await assert.rejects(() => pdfInfo(at("locked.pdf")));
  });
});

describe("imageInfo", () => {
  it("reports natural dimensions of a raster image", async () => {
    assert.deepEqual(await imageInfo(at("photo.png")), { pages: 1, width: 400, height: 300 });
  });

  it("reports dimensions of a vector image", async () => {
    const info = await imageInfo(at("diagram.svg"));
    assert.equal(info.pages, 1);
    assert.ok(info.width > 0 && info.height > 0);
  });
});

describe("renderPage", () => {
  it("renders a PDF page as a PNG data URI", async () => {
    const page = await renderPage(at("statement.pdf"), "pdf", 1, 110);
    assert.match(page.dataUri, /^data:image\/png;base64,/);
    assert.ok(page.width > 0 && page.height > 0);
  });

  it("renders each page differently", async () => {
    const [one, two, three] = await Promise.all([
      renderPage(at("statement.pdf"), "pdf", 1, 110),
      renderPage(at("statement.pdf"), "pdf", 2, 110),
      renderPage(at("statement.pdf"), "pdf", 3, 110),
    ]);
    assert.notEqual(one.dataUri, two.dataUri);
    assert.notEqual(two.dataUri, three.dataUri);
  });

  it("renders larger at a higher DPI, which is how the zoom control works", async () => {
    const fit = await renderPage(at("statement.pdf"), "pdf", 1, 110);
    const in150 = await renderPage(at("statement.pdf"), "pdf", 1, 220);
    assert.ok(in150.width > fit.width, `expected ${in150.width} > ${fit.width}`);
  });

  it("passes a native image straight through at 100%", async () => {
    const page = await renderPage(at("photo.png"), "image", 1, 150);
    assert.match(page.dataUri, /^data:image\/png;base64,/);
  });

  it("converts an SVG to a raster the client can display", async () => {
    const page = await renderPage(at("diagram.svg"), "image", 1, 150);
    assert.match(page.dataUri, /^data:image\/png;base64,/);
    assert.ok(page.dataUri.length > 100);
  });

  it("converts an AVIF, which React Native cannot render directly", { skip: hasAvif() ? false : "ImageMagick has no AVIF delegate" }, async () => {
    const page = await renderPage(at("banner.avif"), "image", 1, 150);
    assert.match(page.dataUri, /^data:image\/png;base64,/);
  });

  it("serves a repeat request from cache", async () => {
    const first = await renderPage(at("statement.pdf"), "pdf", 2, 150);
    const second = await renderPage(at("statement.pdf"), "pdf", 2, 150);
    assert.equal(first.dataUri, second.dataUri);
  });

  it("invalidates the cache when the file changes", async () => {
    // The cache key includes mtime, so an edit re-renders with no file watching.
    const dir = await mkdtemp(join(tmpdir(), "fv-cache-"));
    const copy = join(dir, "copy.pdf");
    await copyFile(at("statement.pdf"), copy);
    const before = await renderPage(copy, "pdf", 1, 110);

    await copyFile(at("photo.png"), copy).catch(() => {});
    await copyFile(at("statement.pdf"), copy);
    const later = new Date(Date.now() + 60_000);
    await utimes(copy, later, later);

    const after = await renderPage(copy, "pdf", 1, 110);
    assert.equal(before.dataUri, after.dataUri, "same content should still render the same");
  });

  it("refuses a page beyond the end of the document", async () => {
    await assert.rejects(() => renderPage(at("statement.pdf"), "pdf", 99, 110));
  });
});
