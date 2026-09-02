import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

/** Formats the viewer can render. Drives which reader the panel opens. */
export const FileKind = z.enum(["pdf", "image", "document", "sheet"]);
export type FileKind = z.infer<typeof FileKind>;

const FileEntry = z.object({
  relPath: z.string(),
  name: z.string(),
  kind: FileKind,
  sizeBytes: z.number(),
  mtime: z.number(),
});
export type FileEntry = z.infer<typeof FileEntry>;

/** A span of text within a block. `link` carries an href when the run is a hyperlink. */
const Run = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  link: z.string().optional(),
});
export type Run = z.infer<typeof Run>;

/**
 * Five block types cover the fifteen tags mammoth emits across the corpus.
 * `image` is load-bearing: some .docx files are pasted screenshots with no
 * text at all, and would otherwise render as a blank page.
 */
const Block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), level: z.number(), runs: z.array(Run) }),
  z.object({ type: z.literal("paragraph"), runs: z.array(Run) }),
  z.object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(z.array(Run)) }),
  z.object({ type: z.literal("table"), rows: z.array(z.array(z.array(Run))) }),
  z.object({ type: z.literal("image"), dataUri: z.string(), alt: z.string().optional() }),
]);
export type Block = z.infer<typeof Block>;

const SheetMeta = z.object({ name: z.string(), rowCount: z.number(), colCount: z.number() });
export type SheetMeta = z.infer<typeof SheetMeta>;

const target = { workspaceId: z.string(), relPath: z.string() };

export const listFiles = defineRpc({
  name: "files.list",
  input: z.object({ workspaceId: z.string() }),
  output: z.object({ files: z.array(FileEntry) }),
});

/** Opens a file and returns whatever that kind needs to start rendering. */
export const openDoc = defineRpc({
  name: "doc.open",
  input: z.object(target),
  output: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("pdf"), pages: z.number(), width: z.number(), height: z.number() }),
    z.object({ kind: z.literal("image"), pages: z.number(), width: z.number(), height: z.number() }),
    z.object({ kind: z.literal("document"), blocks: z.array(Block) }),
    z.object({ kind: z.literal("sheet"), sheets: z.array(SheetMeta) }),
  ]),
});

/** One rasterised page as a PNG data URI. `pdf` and `image` only. */
export const getPage = defineRpc({
  name: "doc.page",
  input: z.object({ ...target, page: z.number().int().min(1), dpi: z.number().int().min(36).max(600) }),
  output: z.object({ dataUri: z.string(), width: z.number(), height: z.number() }),
});

/** A window of spreadsheet cells. Sheets reach 224 rows by 147 columns in the corpus. */
export const getRows = defineRpc({
  name: "doc.rows",
  input: z.object({
    ...target,
    sheet: z.string(),
    offset: z.number().int().min(0),
    limit: z.number().int().min(1).max(500),
  }),
  output: z.object({ rows: z.array(z.array(z.string())), total: z.number() }),
});

/** DPI presets behind the Fit / 100% / 150% zoom control. */
export const ZOOM = [
  { label: "Fit", dpi: 110 },
  { label: "100%", dpi: 150 },
  { label: "150%", dpi: 220 },
] as const;
