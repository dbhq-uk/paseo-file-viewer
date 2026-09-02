import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPage, getRows, listFiles, openDoc, ZOOM } from "../contracts.js";

/**
 * The contracts are validated on both sides of the IPC boundary, so a schema
 * that accepts junk is a real defect rather than a typing nicety.
 */
describe("RPC contracts", () => {
  it("names every method", () => {
    assert.deepEqual(
      [listFiles.name, openDoc.name, getPage.name, getRows.name],
      ["files.list", "doc.open", "doc.page", "doc.rows"],
    );
  });

  it("accepts a well-formed page request", () => {
    const parsed = getPage.input.parse({ workspaceId: "w", relPath: "a.pdf", page: 1, dpi: 150 });
    assert.equal(parsed.page, 1);
  });

  it("rejects a page number below one", () => {
    assert.throws(() => getPage.input.parse({ workspaceId: "w", relPath: "a.pdf", page: 0, dpi: 150 }));
  });

  it("rejects a fractional page number", () => {
    assert.throws(() => getPage.input.parse({ workspaceId: "w", relPath: "a.pdf", page: 1.5, dpi: 150 }));
  });

  it("bounds DPI, so a client cannot ask for a ruinous render", () => {
    assert.throws(() => getPage.input.parse({ workspaceId: "w", relPath: "a.pdf", page: 1, dpi: 5000 }));
    assert.throws(() => getPage.input.parse({ workspaceId: "w", relPath: "a.pdf", page: 1, dpi: 1 }));
  });

  it("caps how many rows one request may pull", () => {
    assert.throws(() => getRows.input.parse({ workspaceId: "w", relPath: "a.xlsx", sheet: "S", offset: 0, limit: 100000 }));
  });

  it("rejects a negative row offset", () => {
    assert.throws(() => getRows.input.parse({ workspaceId: "w", relPath: "a.xlsx", sheet: "S", offset: -1, limit: 10 }));
  });

  it("discriminates the open response by kind", () => {
    const sheet = openDoc.output.parse({ kind: "sheet", sheets: [{ name: "S", rowCount: 1, colCount: 1 }] });
    assert.equal(sheet.kind, "sheet");
    const doc = openDoc.output.parse({ kind: "document", blocks: [{ type: "paragraph", runs: [{ text: "hi" }] }] });
    assert.equal(doc.kind, "document");
    assert.throws(() => openDoc.output.parse({ kind: "document", pages: 3 }));
  });

  it("rejects an unknown block type", () => {
    assert.throws(() =>
      openDoc.output.parse({ kind: "document", blocks: [{ type: "video", src: "x" }] }),
    );
  });

  it("offers three zoom levels in ascending DPI", () => {
    assert.equal(ZOOM.length, 3);
    assert.deepEqual([...ZOOM].map((z) => z.dpi), [110, 150, 220]);
  });
});
