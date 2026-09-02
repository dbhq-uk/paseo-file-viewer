import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { readDocument, readRows, readSheetList } from "../server/office.js";
import type { Block, Run } from "../contracts.js";

const fixtures = new URL("./fixtures/", import.meta.url).pathname;
const text = (runs: Run[]) => runs.map((r) => r.text).join("");
const flat = (blocks: Block[]) =>
  blocks.map((b) => (b.type === "image" ? "[image]" : b.type === "list" ? b.items.map(text).join(" ") : b.type === "table" ? b.rows.flat().map(text).join(" ") : text(b.runs))).join("\n");

describe("readDocument", () => {
  it("maps headings with their level", async () => {
    const blocks = await readDocument(join(fixtures, "rich.docx"));
    const headings = blocks.filter((b) => b.type === "heading");
    assert.ok(headings.length >= 3);
    assert.deepEqual(headings.slice(0, 3).map((h: any) => h.level), [1, 2, 3]);
  });

  it("preserves bold and italic", async () => {
    const blocks = await readDocument(join(fixtures, "rich.docx"));
    const runs = blocks.flatMap((b) => (b.type === "paragraph" ? b.runs : []));
    assert.ok(runs.some((r) => r.bold && r.text.includes("bold")), "expected a bold run");
    assert.ok(runs.some((r) => r.italic && r.text.includes("italic")), "expected an italic run");
  });

  it("keeps hyperlinks, which a run without link would silently drop", async () => {
    const blocks = await readDocument(join(fixtures, "rich.docx"));
    const links = blocks.flatMap((b) => (b.type === "paragraph" ? b.runs : [])).filter((r) => r.link);
    assert.equal(links.length, 1);
    assert.equal(links[0].link, "https://dbhq.uk");
  });

  it("distinguishes ordered from unordered lists", async () => {
    const blocks = await readDocument(join(fixtures, "rich.docx"));
    const lists = blocks.filter((b) => b.type === "list") as Extract<Block, { type: "list" }>[];
    assert.equal(lists.length, 2);
    assert.deepEqual(lists.map((l) => l.ordered).sort(), [false, true]);
    assert.ok(lists.every((l) => l.items.length === 2));
  });

  it("maps a table to rows of cells of runs", async () => {
    const blocks = await readDocument(join(fixtures, "rich.docx"));
    const table = blocks.find((b) => b.type === "table") as Extract<Block, { type: "table" }> | undefined;
    assert.ok(table, "expected a table block");
    assert.equal(table.rows.length, 3);
    assert.equal(table.rows[0].length, 2);
    assert.equal(text(table.rows[1][0]), "one");
  });

  it("returns image blocks for a document that is only a pasted screenshot", async () => {
    // The regression this exists for: without an image block type such a file
    // renders as a completely blank page.
    const blocks = await readDocument(join(fixtures, "imageonly.docx"));
    const images = blocks.filter((b) => b.type === "image") as Extract<Block, { type: "image" }>[];
    assert.ok(images.length >= 1, "expected at least one image block");
    assert.match(images[0].dataUri, /^data:image\/\w+;base64,/);
    assert.ok(flat(blocks).includes("[image]"));
  });

  it("refuses a legacy .doc with a clear message", async () => {
    await assert.rejects(() => readDocument(join(fixtures, "legacy.docx")), /Legacy Office format/);
  });
});

describe("readSheetList", () => {
  it("returns every sheet by name", async () => {
    const sheets = await readSheetList(join(fixtures, "book.xlsx"));
    assert.deepEqual(sheets.map((s) => s.name), ["Alpha", "Beta"]);
    assert.ok(sheets[0].rowCount >= 3);
  });
});

describe("readRows", () => {
  it("returns a window of cells as text", async () => {
    const { rows, total } = await readRows(join(fixtures, "book.xlsx"), "Alpha", 0, 10);
    assert.equal(total, 3);
    assert.deepEqual(rows[0].slice(0, 2), ["Name", "Qty"]);
    assert.deepEqual(rows[1].slice(0, 2), ["widget", "3"]);
  });

  it("honours offset and limit", async () => {
    const { rows } = await readRows(join(fixtures, "book.xlsx"), "Alpha", 1, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0][0], "widget");
  });

  it("renders a formula as its computed result, not the expression", async () => {
    const { rows } = await readRows(join(fixtures, "book.xlsx"), "Alpha", 0, 10);
    assert.equal(rows[1][2], "6");
  });

  it("rejects an unknown sheet by name", async () => {
    await assert.rejects(() => readRows(join(fixtures, "book.xlsx"), "Nope", 0, 10), /No sheet named/);
  });
});
