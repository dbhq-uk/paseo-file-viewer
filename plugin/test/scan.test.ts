import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, describe, it } from "node:test";
import { assertOoxml, assertPdf, kindFor, scanWorkspace } from "../server/scan.js";

const fixtures = new URL("./fixtures/", import.meta.url).pathname;
let root: string;

before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "fv-scan-")));
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, "docs", "a.pdf"), "x");
  await writeFile(join(root, "docs", "b.PNG"), "x");
  await writeFile(join(root, "notes.md"), "x");
  await writeFile(join(root, "node_modules", "pkg", "bundled.pdf"), "x");
  await writeFile(join(root, ".git", "hidden.pdf"), "x");
});

describe("kindFor", () => {
  it("maps each supported extension", () => {
    assert.equal(kindFor("a.pdf"), "pdf");
    assert.equal(kindFor("a.PNG"), "image");
    assert.equal(kindFor("a.svg"), "image");
    assert.equal(kindFor("a.avif"), "image");
    assert.equal(kindFor("a.docx"), "document");
    assert.equal(kindFor("a.xlsx"), "sheet");
  });

  it("returns null for anything else", () => {
    assert.equal(kindFor("a.md"), null);
    assert.equal(kindFor("a.doc"), null);
    assert.equal(kindFor("noextension"), null);
  });
});

describe("scanWorkspace", () => {
  it("finds viewable files and skips the rest", async () => {
    const found = await scanWorkspace(root);
    const paths = found.map((f) => f.relPath).sort();
    assert.deepEqual(paths, [join("docs", "a.pdf"), join("docs", "b.PNG")].sort());
  });

  it("never descends into node_modules or dot directories", async () => {
    const found = await scanWorkspace(root);
    assert.ok(!found.some((f) => f.relPath.includes("node_modules")));
    assert.ok(!found.some((f) => f.relPath.includes(".git")));
  });

  it("reports size and mtime", async () => {
    const [first] = await scanWorkspace(root);
    assert.equal(typeof first.sizeBytes, "number");
    assert.ok(first.mtime > 0);
  });
});

describe("format assertions", () => {
  it("accepts a real OOXML file", async () => {
    await assertOoxml(join(fixtures, "contract.docx"));
  });

  it("names legacy Office format rather than failing obscurely", async () => {
    await assert.rejects(() => assertOoxml(join(fixtures, "legacy-format.docx")), /Legacy Office format/);
  });

  it("rejects a file that is not an Office document at all", async () => {
    await assert.rejects(() => assertOoxml(join(fixtures, "not-really.xlsx")), /not a valid Office document/);
  });

  it("accepts a real PDF and rejects a non-PDF", async () => {
    await assertPdf(join(fixtures, "statement.pdf"));
    await assert.rejects(() => assertPdf(join(fixtures, "contract.docx")), /not a valid PDF/);
  });
});
