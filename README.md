<div align="center">

# paseo-file-viewer

**Read PDFs, images, Word documents and spreadsheets inside Paseo**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Paseo](https://img.shields.io/badge/Paseo-Plugin-6f4ef2)](https://paseo.sh)
[![CI](https://github.com/dbhq-uk/paseo-file-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/dbhq-uk/paseo-file-viewer/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS-lightgrey)]()

A free, open-source tool by [DBHQ](https://dbhq.uk)

</div>

---

Paseo's files panel renders text and code. Everything else - a signed contract, a bank statement, an architecture diagram, a 33-sheet workbook - shows as binary noise. On a phone, where Paseo is often the only way in to the machine, those files simply cannot be read.

This plugin adds a **Viewer** panel that opens them.

| Format | How it renders |
|---|---|
| `.pdf` | Page images, one request per page, with a zoom control |
| `.png` `.jpg` `.webp` `.gif` `.bmp` `.svg` `.avif` | Shown directly, converted only when the format needs it |
| `.docx` | Reflowable text, headings, lists, tables, links and embedded images |
| `.xlsx` | A sheet picker and a scrollable table, loaded in row windows |

## Install

Needs `poppler-utils`, `imagemagick` and `librsvg2-bin` on the daemon machine:

```bash
sudo apt install poppler-utils imagemagick librsvg2-bin   # Debian/Ubuntu
brew install poppler imagemagick librsvg                  # macOS
```

Then:

```bash
git clone https://github.com/dbhq-uk/paseo-file-viewer
cd paseo-file-viewer/plugin && npm install
paseo plugin install "$(pwd)"
```

Plugins must be enabled on the daemon (`pluginsEnabled: true` in `~/.paseo/config.json`, or **Settings -> Plugins**). Open the panel from the workspace sidebar, or press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>K</kbd> and search for "Open file viewer".

## How it works

Plugin client bundles may only import `react`, `react-native`, `@tanstack/react-query`, `zod` and `@getpaseo/plugin`. No pdf.js, no canvas, no gesture library. So the daemon does the work and the client renders the result.

**PDFs and images are rasterised.** `pdftoppm` renders one page at a time at a requested DPI, cached on disk by path, mtime, size, page and DPI. The client requests pages as they scroll into view, so a 200-page document costs one page of work.

**Word documents and spreadsheets are parsed, not rasterised.** This is the design decision the plugin turns on, and it was measured rather than assumed:

| | Convert to PDF, then rasterise | Parse natively |
|---|---|---|
| 33-sheet workbook | LibreOffice, 8.7s, **169 A4 pages** | `exceljs`, 0.4s, 33 named sheets |
| 9-page document | LibreOffice, 2.2s, fixed-width images | `mammoth`, 0.1s, reflowable text |

Rasterising a spreadsheet destroys the one thing that made it navigable. Converted to PDF, that workbook becomes 169 anonymous pages; parsed, you tap the sheet you want. Word documents reflow to the phone instead of being a photograph of an A4 page.

The trade is real and worth stating: **exact page layout is lost for Office documents** - fonts, positioning, headers and footers, page numbers. If layout carries meaning, view the PDF. Legacy `.doc`, `.xls` and `.ppt` are detected by magic bytes and refused with a clear message rather than a crash.

## Zoom

React Native's `maximumZoomScale` is iOS-only, and a plugin cannot import a gesture library. So DPI *is* the zoom control: **Fit / 100% / 150%** re-render the page at 110, 150 or 220 DPI and the reader scrolls sideways when the page is wider than the viewport. It behaves the same on desktop, Android and iOS. Parsed documents need no zoom, because text reflows and tables scroll.

## Scope and safety

The viewer is scoped to the current workspace. The backend resolves the workspace directory from its id rather than accepting a path from the client, and every request is `realpath`-ed and rejected unless it lands inside that root - which catches `../` traversal and symlinks pointing out of the tree.

This matters because **Paseo plugins are trusted, unsandboxed code**. The backend half runs as a subprocess with your full user rights. Nothing here is a substitute for reading the source before you install it.

## Development

```bash
cd plugin
npm install
npm run typecheck
npm test
paseo plugin reload file-viewer
paseo plugin logs file-viewer
```

`server/` is plain Node with no Paseo coupling, so it tests directly - 75 tests covering the path guard, format detection, the block mapping, cell rendering, the rasteriser and cache, and the RPC schemas.

**Fixtures are committed**, so the suite runs anywhere with only `poppler-utils`, `imagemagick` and `librsvg2-bin` installed. They are invented documents - a fictional consulting agreement, invoice workbook and account statement, plus deliberately malformed files for the refusal paths. No real document appears in this repository.

Regenerate them only when one needs to change (this additionally needs `pandoc` and `qpdf`):

```bash
node test/make-fixtures.mjs
```

CI runs the suite on Node 20, 22 and 24, gates on `npm audit --audit-level=moderate`, and separately checks that the fixture generator still works.

## Licence

MIT
