# Paseo File Viewer - design

**Status:** design agreed 2nd September 2026, not yet implemented
**Repo:** `dbhq-uk/paseo-file-viewer` (public - a free tool by DBHQ)
**Target:** Paseo 0.7.2 plugin API

## The problem

Paseo's built-in files panel renders text and code. Everything else - a signed contract, an SA statement, a diagram, a spreadsheet - shows as binary noise. On a phone, where Paseo is often the only way in to the machine, there is no way to read those files at all.

Across the two repositories this was designed against there are 238 PDFs, roughly 235 images and 14 Office documents. All of them are currently unreadable in Paseo.

## The constraint that shapes everything

A plugin's client bundle may only import `react`, `react-native`, `@tanstack/react-query`, `zod`, `@getpaseo/plugin` and `@getpaseo/plugin/server`. Paseo supplies these at runtime and nothing else resolves.

That rules out pdf.js, react-pdf, any canvas library and any gesture library. The only thing the client can display is a React Native `<Image>`. So **every format must be rasterised on the daemon and sent to the client as a PNG.** This is not a preference, it is the only route available.

## Architecture

Everything collapses into a single pipeline. Office documents become PDFs, PDFs become PNGs, awkward images become PNGs. One renderer, three thin adapters in front of it.

```
request (path, page, dpi)
        |
   resolve + guard          realpath must sit inside the workspace root
        |
   detect kind              extension, confirmed by magic bytes
        |
   normalise
     office  ->  soffice --headless --convert-to pdf   (cached)
     pdf     ->  unchanged
     svg     ->  rsvg-convert -> png
     avif    ->  ImageMagick convert -> png
     png/jpg/webp -> unchanged
        |
   rasterise
     pdf-ish ->  pdftoppm -png -r <dpi> -f <page> -l <page>
     image   ->  convert -resize <scale from dpi>
        |
   cache                    keyed by realpath + mtime + size + page + dpi
        |
   base64 PNG -> client
```

Images are modelled as single-page documents, so the client has one rendering path and never branches on kind. Kind is used only to pick the list icon.

## Components

| File | Responsibility |
|---|---|
| `paseo-plugin.json` | Manifest, id `file-viewer` |
| `index.tsx` | `contribute()` - registers the panel, a Command Center item, three RPC handlers |
| `server/paths.ts` | Path resolution and the workspace containment guard |
| `server/convert.ts` | Kind detection and the normalise step (soffice, rsvg-convert, ImageMagick) |
| `server/render.ts` | Rasterise and cache |
| `client/FileList.tsx` | Searchable list of viewable files |
| `client/Reader.tsx` | Page scroller, zoom control, error states |
| `client/Panel.tsx` | Switches between list and reader |

Only `server/` touches the filesystem or spawns a process. The client holds no paths beyond the workspace-relative string it was given.

## RPC contracts

Three contracts, Zod-validated in both directions.

**`files.list`** - input `{ workspaceId }`, output `{ files: [{ relPath, name, kind, sizeBytes, mtime }] }`. Walks the workspace root, skipping `node_modules`, `.git`, `dist` and `.cache`. Returns only files the plugin can actually render.

**`doc.info`** - input `{ workspaceId, relPath }`, output `{ kind, pages, width, height }`. Runs the normalise step if needed, then `pdfinfo` or ImageMagick `identify`.

**`doc.page`** - input `{ workspaceId, relPath, page, dpi }`, output `{ dataUri, width, height }`. One page, one PNG.

The client fetches pages as they scroll into view through TanStack Query, so a 200-page document costs one page of work.

## Zoom without a zoom gesture

React Native's `maximumZoomScale` is iOS-only and the client cannot import a gesture library. So DPI becomes the zoom control: **Fit / 100% / 150%** buttons re-request the page at 110, 150 or 220 DPI, and the reader scrolls horizontally when the rendered image is wider than the viewport.

This costs nothing extra - `dpi` is already a parameter of `doc.page` - and it behaves identically on desktop, Android and iOS.

## Path safety

Plugin backends are unsandboxed: they can read any file the daemon user can. The panel is scoped to the current workspace, and that scope has to be enforced rather than assumed.

Every request resolves the path with `realpath` and rejects anything that does not sit inside the resolved workspace root. This covers `../` traversal and symlinks pointing out of the tree. The client never supplies an absolute path - only a workspace-relative one - and the guard runs before any file is opened or any process is spawned.

This is the piece that gets the most test coverage.

## Failure handling

Every case below surfaces as readable text in the panel and is logged to stdout, so `paseo plugin logs file-viewer` shows what happened.

- **Encrypted or password-protected PDF** - `pdftoppm` exits non-zero; report that the file is protected rather than that rendering failed
- **Corrupt file** - magic bytes do not match the extension
- **Missing binary** - checked once at plugin start; the panel says which tool to install
- **Conversion timeout** - `soffice` in particular can hang, so every spawn gets a 30s kill timer
- **Concurrent LibreOffice calls** - `soffice` collides with itself unless each invocation gets its own `-env:UserInstallation` profile directory. Conversions are also serialised through a single-slot queue

## Cache

PNGs are written under `os.tmpdir()/paseo-file-viewer/`, keyed by a hash of realpath, mtime, size, page and DPI - so editing a file invalidates its pages without any watching. Converted PDFs from Office documents are cached the same way, which is what makes the slow `soffice` cold start a one-off per document.

The cache is bounded at 500MB and evicted least-recently-used.

## Testing

`server/` is plain Node with no Paseo coupling, so it tests directly against fixture files - one per family, plus an encrypted PDF, a corrupt file and a symlink pointing outside the workspace.

The path guard, the cache key and the timeout behaviour get explicit tests. The client components are thin enough to verify by eye across a wide desktop window, a compact mobile client and both themes.

## Non-goals

- **Text, code and markdown** - Paseo's files panel already renders them
- **Video and audio** - would need ffmpeg, which is not installed, and there are no media files in the target corpus
- **Editing, annotation, OCR, search within a document** - read-only viewer
- **Files outside the workspace** - deliberate, see Path safety

## Open items

- Whether HTML should render through headless Chrome, which is installed. Left out of v1: the HTML in the target corpus is build output rather than anything worth reading
