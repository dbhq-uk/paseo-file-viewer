# Paseo File Viewer - design

**Status:** design agreed 2nd September 2026, not yet implemented
**Repo:** `dbhq-uk/paseo-file-viewer` (public - a free tool by DBHQ)
**Target:** Paseo 0.7.2 plugin API

## The problem

Paseo's built-in files panel renders text and code. Everything else - a signed contract, an SA statement, a diagram, a spreadsheet - shows as binary noise. On a phone, where Paseo is often the only way in to the machine, there is no way to read those files at all.

Across the two repositories this was designed against there are 238 PDFs, roughly 235 images and 14 Office documents. All of them are currently unreadable in Paseo.

## The constraint that shapes everything

A plugin's client bundle may only import `react`, `react-native`, `@tanstack/react-query`, `zod`, `@getpaseo/plugin` and `@getpaseo/plugin/server`. Paseo supplies these at runtime and nothing else resolves.

That rules out pdf.js, react-pdf, any canvas library and any gesture library. The client can display a React Native `<Image>`, or React Native components built from data. Backend code has no such limit - it is ordinary Node and may use installed dependencies.

So the design question for each format is: **rasterise it on the daemon and ship a PNG, or parse it on the daemon and ship data the client renders natively?**

## Two paths, chosen per format

```
                        ┌─ PDF     ─┐
   rasterise            │           │  pdftoppm -png -r <dpi> -f <n> -l <n>
   (ship a PNG)         └─ images  ─┘  svg/avif normalised first, others as-is
                                       |
                                       └─> base64 PNG -> <Image>

                        ┌─ .docx   ─┐  mammoth -> block tree
   parse                │           │
   (ship data)          └─ .xlsx   ─┘  exceljs -> named sheets, row windows
                                       |
                                       └─> JSON -> native RN components
```

PDFs and images have no structure to recover, so a page image is the honest representation. Office documents do, and throwing it away to make a picture is a loss - measured below.

### Why Office documents are parsed, not rasterised

Both paths were benchmarked against real files before this was decided.

| File | Convert to PDF and rasterise | Parse natively |
|---|---|---|
| 33-sheet Azure inventory workbook | LibreOffice, 8.7s, **169 A4 pages** | `exceljs`, 411ms, 33 named sheets |
| 9-page formal complaint | LibreOffice, 2.2s, fixed-width page images | `mammoth`, 107ms, reflowable text |

The spreadsheet case decides it. 169 pages of arbitrary page breaks, each needing its own PNG render, replaces a workbook you could navigate by sheet name. Rasterising destroys the one structure that made the file usable.

`mammoth` emits only nine HTML tags on real input - `p`, `strong`, `em`, `h2`, `ol`, `li`, `table`, `tr`, `td` - a set small enough to map directly onto React Native components. Text then reflows to the phone rather than being a photograph of an A4 page.

LibreOffice is not used at all. It was in an earlier draft of this design and the benchmarks removed it, along with the timeout, profile-directory and serialisation handling it would have needed.

**What this costs.** Exact layout is lost for Office documents: fonts, positioning, headers and footers, page numbers, where a signature block sits. For a contract, a page image is more faithful to what was actually signed. Legacy `.doc` is also unsupported, since `mammoth` reads only `.docx`. Both are accepted; see Non-goals.

## Components

| File | Responsibility |
|---|---|
| `paseo-plugin.json` | Manifest, id `file-viewer` |
| `index.tsx` | `contribute()` - registers the panel, a Command Center item, four RPC handlers |
| `server/paths.ts` | Path resolution and the workspace containment guard |
| `server/scan.ts` | Workspace walk and kind detection |
| `server/raster.ts` | PDF and image normalise, rasterise, cache |
| `server/office.ts` | `mammoth` and `exceljs` parsing into the wire shapes |
| `client/FileList.tsx` | Searchable list of viewable files |
| `client/PageReader.tsx` | Page scroller and zoom control, for PDFs and images |
| `client/DocReader.tsx` | Block renderer for `.docx` |
| `client/SheetReader.tsx` | Sheet picker and virtualised table for `.xlsx` |
| `client/Panel.tsx` | Switches between list and the right reader |

Only `server/` touches the filesystem or spawns a process. The client holds no paths beyond the workspace-relative string it was given.

## RPC contracts

Four contracts, Zod-validated in both directions.

**`files.list`** - input `{ workspaceId }`, output `{ files: [{ relPath, name, kind, sizeBytes, mtime }] }`. Walks the workspace root, skipping `node_modules`, `.git`, `dist` and `.cache`. Returns only files the plugin can render. `kind` is one of `pdf`, `image`, `document`, `sheet`.

**`doc.open`** - input `{ workspaceId, relPath }`. Output is a discriminated union on `kind`:

- `pdf` / `image` - `{ pages, width, height }`
- `document` - `{ blocks }`, the whole parsed document, since a 10KB `.docx` yields roughly 15KB of JSON
- `sheet` - `{ sheets: [{ name, rowCount, colCount }] }`, names only, no cell data

**`doc.page`** - input `{ workspaceId, relPath, page, dpi }`, output `{ dataUri, width, height }`. One rasterised page. Used by `pdf` and `image` only.

**`doc.rows`** - input `{ workspaceId, relPath, sheet, offset, limit }`, output `{ rows, total }`. A window of cells. Needed because sheets in the target corpus reach 224 rows by 147 columns, which is too wide and too tall to ship or render at once.

The client fetches pages and row windows as they scroll into view through TanStack Query, so a 200-page PDF or a 10,000-row sheet costs one screen of work.

### Block shape for documents

`mammoth`'s HTML is parsed on the daemon into a flat block array, so the client never parses HTML:

```
Block  = { type: 'heading', level, runs }
       | { type: 'paragraph', runs }
       | { type: 'list', ordered, items: runs[] }
       | { type: 'table', rows: runs[][] }
Run    = { text, bold?, italic? }
```

Four block types and three run properties cover every tag `mammoth` produced across the real corpus. Anything it emits outside that set degrades to a plain paragraph rather than failing.

## Zoom without a zoom gesture

React Native's `maximumZoomScale` is iOS-only and the client cannot import a gesture library. So DPI becomes the zoom control on the rasterised path: **Fit / 100% / 150%** buttons re-request the page at 110, 150 or 220 DPI, and the reader scrolls horizontally when the rendered image is wider than the viewport.

This costs nothing extra - `dpi` is already a parameter of `doc.page` - and behaves identically on desktop, Android and iOS. The parsed path needs no zoom control at all, because text reflows and tables scroll.

## Path safety

Plugin backends are unsandboxed: they can read any file the daemon user can. The panel is scoped to the current workspace, and that scope has to be enforced rather than assumed.

Every request resolves the path with `realpath` and rejects anything that does not sit inside the resolved workspace root. This covers `../` traversal and symlinks pointing out of the tree. The client never supplies an absolute path - only a workspace-relative one - and the guard runs before any file is opened or any process is spawned.

This is the piece that gets the most test coverage.

## Dependencies and their risks

Backend only. The client bundle adds nothing.

| Package | Why | Risk |
|---|---|---|
| `mammoth` | `.docx` to structured blocks | Clean audit |
| `exceljs` 4.4.0 | `.xlsx` to sheets and rows | Audits moderate, via an old transitive `uuid` in a code path never called. Pinned forward with an npm `overrides` entry |

`xlsx` (SheetJS) 0.18.5 is the better-known spreadsheet library and is **deliberately not used**: `npm audit` reports high-severity prototype pollution and ReDoS in the parser itself, which is exactly the code that would meet untrusted files.

Poppler (`pdftoppm`, `pdfinfo`), `rsvg-convert` and ImageMagick are external binaries, checked once at plugin start.

## Failure handling

Every case below surfaces as readable text in the panel and is logged to stdout, so `paseo plugin logs file-viewer` shows what happened.

- **Encrypted or password-protected PDF** - `pdftoppm` exits non-zero; report that the file is protected rather than that rendering failed
- **Corrupt file** - magic bytes do not match the extension
- **Legacy `.doc`** - detected by magic bytes and reported as unsupported, rather than failing inside `mammoth`
- **Missing binary** - the panel says which tool to install
- **Rasterise timeout** - every spawn gets a 30s kill timer
- **Very large sheet** - `doc.rows` is windowed, so size degrades to more requests rather than a stall

## Cache

Rasterised PNGs are written under `os.tmpdir()/paseo-file-viewer/`, keyed by a hash of realpath, mtime, size, page and DPI - so editing a file invalidates its pages without any watching. The cache is bounded at 500MB and evicted least-recently-used.

Parsed Office output is not cached to disk. At 107ms and 411ms it is cheaper to reparse than to manage another cache, and TanStack Query already holds it for the life of the panel.

## Testing

`server/` is plain Node with no Paseo coupling, so it tests directly against fixture files - one per kind, plus an encrypted PDF, a corrupt file, a legacy `.doc` and a symlink pointing outside the workspace.

The path guard, the cache key, the block mapping and the row windowing get explicit tests. The client components are thin enough to verify by eye across a wide desktop window, a compact mobile client and both themes.

## Non-goals

- **Text, code and markdown** - Paseo's files panel already renders them
- **Exact page layout for Office documents** - a deliberate trade for speed and mobile reflow, see above
- **Legacy `.doc`, `.xls`, `.ppt`** - the corpus has none, and supporting them means reintroducing LibreOffice
- **PowerPoint** - no `.pptx` in the corpus
- **Video and audio** - would need ffmpeg, which is not installed, and there are no media files in the corpus
- **Editing, annotation, OCR, search within a document** - read-only viewer
- **Files outside the workspace** - deliberate, see Path safety

## Open items

- Whether HTML should render through headless Chrome, which is installed. Left out of v1: the HTML in the target corpus is build output rather than anything worth reading
