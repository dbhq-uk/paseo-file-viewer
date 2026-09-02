// Generates every fixture the tests need, so no real document is ever
// committed to this public repository.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
mkdirSync(dir, { recursive: true });
const at = (name) => join(dir, name);

// A .docx exercising every tag mammoth emits: headings, bold, italic, links,
// ordered and unordered lists, a table, and a line break.
const md = `# Title

A paragraph with **bold**, *italic* and a [link](https://dbhq.uk).

## Second level

### Third level

- first bullet
- second bullet

1. first step
2. second step

| Column A | Column B |
|---|---|
| one | two |
| three | four |
`;
writeFileSync(at("rich.md"), md);
execFileSync("pandoc", [at("rich.md"), "-o", at("rich.docx")]);

// A .docx that is nothing but an image. This is the shape that renders as a
// blank page if the block mapping drops img.
execFileSync("convert", ["-size", "400x300", "xc:steelblue", at("shot.png")]);
writeFileSync(at("imageonly.md"), `![](${at("shot.png")})\n`);
execFileSync("pandoc", [at("imageonly.md"), "-o", at("imageonly.docx")]);

// A two-page PDF. Built from images rather than pandoc, which needs a LaTeX
// engine that is not installed here.
execFileSync("convert", ["-size", "595x842", "xc:white", "-pointsize", "36",
  "-fill", "black", "-annotate", "+60+120", "Page one", at("p1.png")]);
execFileSync("convert", ["-size", "595x842", "xc:white", "-pointsize", "36",
  "-fill", "black", "-annotate", "+60+120", "Page two", at("p2.png")]);
execFileSync("convert", [at("p1.png"), at("p2.png"), at("sample.pdf")]);

// An encrypted PDF, to check the error message names the real cause.
execFileSync("qpdf", ["--encrypt", "pw", "pw", "256", "--", at("sample.pdf"), at("encrypted.pdf")]);

// A workbook with two named sheets and a formula.
const wb = new ExcelJS.Workbook();
const a = wb.addWorksheet("Alpha");
a.addRow(["Name", "Qty"]);
a.addRow(["widget", 3]);
a.addRow(["cog", 4]);
a.getCell("C2").value = { formula: "B2*2", result: 6 };
const b = wb.addWorksheet("Beta");
b.addRow(["only"]);
await wb.xlsx.writeFile(at("book.xlsx"));

// A legacy OLE2 file wearing a .docx extension.
const ole = Buffer.alloc(512);
Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(ole);
writeFileSync(at("legacy.docx"), ole);

// Not an Office file at all, despite the extension.
writeFileSync(at("bogus.xlsx"), "this is plain text");

console.log("fixtures written to", dir);
