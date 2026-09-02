import mammoth from "mammoth";
import ExcelJS from "exceljs";
import { parse, type HTMLElement, type Node } from "node-html-parser";
import { assertOoxml } from "./scan.js";
import type { Block, Run, SheetMeta } from "../contracts.js";

const HEADINGS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

function isElement(node: Node): node is HTMLElement {
  return (node as HTMLElement).tagName !== undefined;
}

/**
 * Flattens an element's children into runs, carrying bold, italic and href
 * down through nesting. `<br>` becomes a newline inside the run text rather
 * than a new block, so address lines and sign-offs keep their shape.
 */
function runsFrom(node: Node, inherited: Omit<Run, "text"> = {}): Run[] {
  const out: Run[] = [];

  function walk(current: Node, style: Omit<Run, "text">): void {
    if (!isElement(current)) {
      const text = current.rawText;
      if (text) out.push({ ...style, text: decode(text) });
      return;
    }
    const tag = current.tagName?.toLowerCase();
    if (tag === "br") {
      out.push({ ...style, text: "\n" });
      return;
    }
    const next = { ...style };
    if (tag === "strong" || tag === "b") next.bold = true;
    if (tag === "em" || tag === "i") next.italic = true;
    if (tag === "a") {
      const href = current.getAttribute("href");
      if (href) next.link = href;
    }
    for (const child of current.childNodes) walk(child, next);
  }

  walk(node, inherited);
  return merge(out);
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m);
}

/** Joins adjacent runs that share styling, so the client renders fewer spans. */
function merge(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = out[out.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic && last.link === run.link) {
      last.text += run.text;
    } else {
      out.push({ ...run });
    }
  }
  return out;
}

function imageBlock(el: HTMLElement): Block | null {
  const src = el.getAttribute("src");
  if (!src) return null;
  const alt = el.getAttribute("alt");
  return { type: "image", dataUri: src, ...(alt ? { alt } : {}) };
}

/** Pulls images out of a container so a paragraph wrapping an image still yields it. */
function imagesWithin(el: HTMLElement): Block[] {
  return el.querySelectorAll("img").map(imageBlock).filter((b): b is Block => b !== null);
}

function blocksFrom(el: HTMLElement): Block[] {
  const tag = el.tagName?.toLowerCase() ?? "";

  if (tag === "img") {
    const block = imageBlock(el);
    return block ? [block] : [];
  }

  if (HEADINGS[tag]) {
    const runs = runsFrom(el);
    return runs.length ? [{ type: "heading", level: HEADINGS[tag], runs }] : [];
  }

  if (tag === "ul" || tag === "ol") {
    const items = el
      .querySelectorAll("li")
      .map((li) => runsFrom(li))
      .filter((runs) => runs.length > 0);
    return items.length ? [{ type: "list", ordered: tag === "ol", items }] : [];
  }

  if (tag === "table") {
    const rows = el.querySelectorAll("tr").map((tr) =>
      tr.querySelectorAll("td,th").map((cell) => runsFrom(cell)),
    );
    return rows.length ? [{ type: "table", rows }] : [];
  }

  // Paragraphs and anything unrecognised degrade to a paragraph, with any
  // embedded images lifted out as their own blocks so they are never lost.
  const images = imagesWithin(el);
  const runs = runsFrom(el);
  const blocks: Block[] = [];
  if (runs.length) blocks.push({ type: "paragraph", runs });
  blocks.push(...images);
  return blocks;
}

/** Converts a .docx into the block tree the client renders natively. */
export async function readDocument(file: string): Promise<Block[]> {
  await assertOoxml(file);
  const { value: html } = await mammoth.convertToHtml({ path: file });
  const root = parse(html);
  const blocks: Block[] = [];
  for (const node of root.childNodes) {
    if (isElement(node)) blocks.push(...blocksFrom(node));
    else if (node.rawText?.trim()) blocks.push({ type: "paragraph", runs: [{ text: decode(node.rawText) }] });
  }
  return blocks;
}

async function loadWorkbook(file: string): Promise<ExcelJS.Workbook> {
  await assertOoxml(file);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb;
}

export async function readSheetList(file: string): Promise<SheetMeta[]> {
  const wb = await loadWorkbook(file);
  return wb.worksheets.map((ws) => ({
    name: ws.name,
    rowCount: ws.rowCount ?? 0,
    colCount: ws.columnCount ?? 0,
  }));
}

/**
 * Renders a cell as the text a reader should see.
 *
 * Formulas are the awkward case. A workbook stores the expression and,
 * usually, a cached result - but not always, and exceljs does not preserve
 * one it did not read. With no cached value the honest thing is to show the
 * expression, because rendering an empty string makes a populated column look
 * blank and gives the reader no clue why.
 */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== "object") return String(value);

  const v = value as any;
  if (v.error) return String(v.error);
  if (v.richText) return v.richText.map((r: any) => r.text ?? "").join("");
  if (v.formula !== undefined || v.sharedFormula !== undefined) {
    if (v.result !== undefined && v.result !== null) return cellText(v.result);
    return `=${v.formula ?? v.sharedFormula}`;
  }
  if (v.hyperlink) return String(v.text ?? v.hyperlink);
  if (typeof v.text === "string") return v.text;
  return "";
}

export interface RowWindow {
  rows: string[][];
  total: number;
}

/** Returns a window of cells. Sheets in the corpus reach 224 rows by 147 columns. */
export async function readRows(file: string, sheetName: string, offset: number, limit: number): Promise<RowWindow> {
  const wb = await loadWorkbook(file);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`No sheet named "${sheetName}"`);

  const total = ws.rowCount ?? 0;
  const cols = ws.columnCount ?? 0;
  const rows: string[][] = [];

  for (let n = offset + 1; n <= Math.min(offset + limit, total); n += 1) {
    const row = ws.getRow(n);
    const cells: string[] = [];
    for (let c = 1; c <= cols; c += 1) cells.push(cellText(row.getCell(c).value));
    rows.push(cells);
  }

  return { rows, total };
}
