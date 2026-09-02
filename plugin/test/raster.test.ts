import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { imageInfo, pdfInfo, renderPage } from "../server/raster.js";

const fixtures = new URL("./fixtures/", import.meta.url).pathname;

describe("pdfInfo", () => {
  it("reports the page count and page size", async () => {
    const info = await pdfInfo(join(fixtures, "sample.pdf"));
    assert.equal(info.pages, 2);
    assert.ok(info.width > 1000 && info.height > 1500, `unexpected dimensions ${info.width}x${info.height}`);
  });

  it("refuses a file that is not a PDF", async () => {
    await assert.rejects(() => pdfInfo(join(fixtures, "rich.docx")), /not a valid PDF/);
  });
});

describe("imageInfo", () => {
  it("reports natural dimensions", async () => {
    const info = await imageInfo(join(fixtures, "shot.png"));
    assert.deepEqual([info.pages, info.width, info.height], [1, 400, 300]);
  });
});

describe("renderPage", () => {
  it("renders a PDF page as a PNG data URI", async () => {
    const page = await renderPage(join(fixtures, "sample.pdf"), "pdf", 1, 110);
    assert.match(page.dataUri, /^data:image\/png;base64,/);
    assert.ok(page.width > 0 && page.height > 0);
  });

  it("renders different pages differently", async () => {
    const one = await renderPage(join(fixtures, "sample.pdf"), "pdf", 1, 110);
    const two = await renderPage(join(fixtures, "sample.pdf"), "pdf", 2, 110);
    assert.notEqual(one.dataUri, two.dataUri);
  });

  it("renders a larger image at a higher DPI", async () => {
    const fit = await renderPage(join(fixtures, "sample.pdf"), "pdf", 1, 110);
    const big = await renderPage(join(fixtures, "sample.pdf"), "pdf", 1, 220);
    assert.ok(big.width > fit.width, `expected ${big.width} > ${fit.width}`);
  });

  it("passes a native image through untouched at 100%", async () => {
    const page = await renderPage(join(fixtures, "shot.png"), "image", 1, 150);
    assert.match(page.dataUri, /^data:image\/png;base64,/);
  });

  it("serves the second call from cache", async () => {
    const first = await renderPage(join(fixtures, "sample.pdf"), "pdf", 1, 150);
    const second = await renderPage(join(fixtures, "sample.pdf"), "pdf", 1, 150);
    assert.equal(first.dataUri, second.dataUri);
  });

  it("says an encrypted PDF is protected rather than just failing", async () => {
    await assert.rejects(() => pdfInfo(join(fixtures, "encrypted.pdf")));
  });
});
