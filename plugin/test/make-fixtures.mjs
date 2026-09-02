/**
 * Regenerates the checked-in test fixtures.
 *
 * Every fixture is invented. No real document, client, person or figure
 * appears here - this repository is public, and the corpus the plugin was
 * built against is not.
 *
 * The fixtures ARE committed, so the suite runs anywhere without pandoc,
 * qpdf or ImageMagick. Run this only when a fixture needs to change.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const at = (name) => join(dir, name);
const scratch = [];
const temp = (name) => {
  const path = at(name);
  if (!scratch.includes(path)) scratch.push(path);
  return path;
};

// ---------------------------------------------------------------------------
// contract.docx - every tag mammoth emits: three heading levels, bold, italic,
// a hyperlink, both list kinds, a table, and an ampersand entity.
// ---------------------------------------------------------------------------
writeFileSync(
  temp("contract.md"),
  `# Consulting Agreement

**Between** Northwind Analytics Ltd (the Client) *and* Bramble Systems Ltd (the Supplier).

## 1. Services

The Supplier will provide the services in Schedule A. Terms are published at [example.com](https://example.com/terms).

### 1.1 Working arrangements

- Remote by default
- On site by agreement
- Equipment supplied by the Client

### 1.2 Order of precedence

1. This agreement
2. Schedule A
3. Any purchase order

## 2. Charges

| Item | Rate | Unit |
|---|---|---|
| Standard day | 550 | per day |
| Out of hours | 700 | per day |
| Travel & expenses | at cost | per claim |

## 3. Termination

Either party may terminate on 30 days written notice.
`,
);
execFileSync("pandoc", [temp("contract.md"), "-o", at("contract.docx")]);

// ---------------------------------------------------------------------------
// scanned-report.docx - a document that is only a pasted screenshot. This is
// the shape that renders as a blank page if image blocks are dropped.
// ---------------------------------------------------------------------------
execFileSync("convert", [
  "-size", "640x420", "xc:white",
  "-fill", "#1f3a5f", "-draw", "rectangle 0,0 640,60",
  "-pointsize", "22", "-fill", "white", "-annotate", "+20+38", "Quarterly Summary",
  "-pointsize", "16", "-fill", "#222222", "-annotate", "+20+120", "Revenue    120,000",
  "-annotate", "+20+160", "Costs       74,500",
  "-annotate", "+20+200", "Margin      45,500",
  temp("chart.png"),
]);
writeFileSync(temp("scanned.md"), `![Quarterly summary](${temp("chart.png")})\n`);
execFileSync("pandoc", [temp("scanned.md"), "-o", at("scanned-report.docx")]);

// ---------------------------------------------------------------------------
// invoices.xlsx - three named sheets, a formula, dates and an empty cell.
// ---------------------------------------------------------------------------
const wb = new ExcelJS.Workbook();

const summary = wb.addWorksheet("Summary");
summary.addRow(["Period", "Invoiced", "Paid", "Outstanding"]);
summary.addRow(["Q1", 24000, 24000, 0]);
summary.addRow(["Q2", 31500, 18000, 13500]);
summary.getCell("E2").value = { formula: "B2-C2", result: 0 };

const detail = wb.addWorksheet("Invoices");
detail.addRow(["Number", "Client", "Issued", "Net", "Status"]);
detail.addRow(["INV-1001", "Northwind Analytics", new Date("2026-01-14"), 8000, "paid"]);
detail.addRow(["INV-1002", "Bramble Systems", new Date("2026-02-02"), 16000, "paid"]);
detail.addRow(["INV-1003", "Northwind Analytics", new Date("2026-04-19"), 13500, ""]);

const notes = wb.addWorksheet("Notes");
notes.addRow(["No notes this period"]);

await wb.xlsx.writeFile(at("invoices.xlsx"));

// ---------------------------------------------------------------------------
// statement.pdf - three pages. Built with ImageMagick, because pandoc needs a
// LaTeX engine that is not assumed to be present.
// ---------------------------------------------------------------------------
const pages = [
  ["Account Statement", "Bramble Systems Ltd", "Page 1 of 3", "Opening balance    12,480.00"],
  ["Transactions", "14 Jan  INV-1001 received    8,000.00", "02 Feb  INV-1002 received   16,000.00", "18 Feb  Supplier payment   -3,240.00"],
  ["Summary", "Closing balance    33,240.00", "Page 3 of 3", "This statement is illustrative."],
];
const pageFiles = pages.map((lines, index) => {
  const file = temp(`page${index}.png`);
  const args = [
    "-size", "1240x1754", "xc:white",
    "-pointsize", "44", "-fill", "#111111", "-annotate", "+90+160", lines[0],
    "-pointsize", "28",
  ];
  lines.slice(1).forEach((line, n) => args.push("-annotate", `+90+${280 + n * 60}`, line));
  args.push(file);
  execFileSync("convert", args);
  return file;
});
execFileSync("convert", [...pageFiles, "-density", "150", at("statement.pdf")]);

// An encrypted copy, so the protected-file path has a real file behind it.
execFileSync("qpdf", ["--encrypt", "secret", "secret", "256", "--", at("statement.pdf"), at("locked.pdf")]);

// ---------------------------------------------------------------------------
// Images: native, vector, and one needing conversion.
// ---------------------------------------------------------------------------
execFileSync("convert", ["-size", "400x300", "gradient:#3b6ea5-#0d1b2a", at("photo.png")]);
execFileSync("convert", ["-size", "300x200", "gradient:#a53b3b-#2a0d0d", at("banner.avif")]);
writeFileSync(
  at("diagram.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
  <rect width="320" height="200" fill="#f4f6f8"/>
  <rect x="30" y="40" width="110" height="60" rx="8" fill="#3b6ea5"/>
  <rect x="180" y="40" width="110" height="60" rx="8" fill="#6a8f3f"/>
  <line x1="140" y1="70" x2="180" y2="70" stroke="#333333" stroke-width="3"/>
  <text x="45" y="130" font-family="sans-serif" font-size="14" fill="#222222">Source</text>
  <text x="195" y="130" font-family="sans-serif" font-size="14" fill="#222222">Target</text>
</svg>
`,
);

// ---------------------------------------------------------------------------
// Malformed inputs, so every refusal path is exercised against a real file.
// ---------------------------------------------------------------------------
const ole2 = Buffer.alloc(512);
Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(ole2);
writeFileSync(at("legacy-format.docx"), ole2);
writeFileSync(at("not-really.xlsx"), "plain text pretending to be a workbook\n");
writeFileSync(at("truncated.pdf"), "%PDF-1.4\nbroken");

for (const file of scratch) rmSync(file, { force: true });
console.log(`fixtures written to ${dir}`);
