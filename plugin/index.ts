import type { PluginContext } from "@getpaseo/plugin";
import { getPage, getRows, listFiles, openDoc } from "./contracts.js";
import { FileViewerPanel } from "./main.client.js";
import { readDocument, readRows, readSheetList } from "./server/office.js";
import { safeResolve, workspaceRoot } from "./server/paths.js";
import { imageInfo, pdfInfo, renderPage } from "./server/raster.js";
import { kindFor, scanWorkspace } from "./server/scan.js";

/**
 * Every handler resolves the workspace root from its id and re-checks the
 * path, rather than trusting anything the client sent. Plugin backends are
 * unsandboxed, so this runs before any file is opened.
 */
async function locate(paseo: any, workspaceId: string, relPath: string) {
  const root = await workspaceRoot(paseo, workspaceId);
  const file = await safeResolve(root, relPath);
  const kind = kindFor(file);
  if (!kind) throw new Error("This file type cannot be viewed");
  return { file, kind };
}

export default function contribute(plugin: PluginContext) {
  plugin.handle(listFiles, async ({ workspaceId }, { paseo }) => {
    const root = await workspaceRoot(paseo, workspaceId);
    return { files: await scanWorkspace(root) };
  });

  plugin.handle(openDoc, async ({ workspaceId, relPath }, { paseo }) => {
    const { file, kind } = await locate(paseo, workspaceId, relPath);
    if (kind === "pdf") return { kind: "pdf" as const, ...(await pdfInfo(file)) };
    if (kind === "image") return { kind: "image" as const, ...(await imageInfo(file)) };
    if (kind === "document") return { kind: "document" as const, blocks: await readDocument(file) };
    return { kind: "sheet" as const, sheets: await readSheetList(file) };
  });

  plugin.handle(getPage, async ({ workspaceId, relPath, page, dpi }, { paseo }) => {
    const { file, kind } = await locate(paseo, workspaceId, relPath);
    if (kind !== "pdf" && kind !== "image") throw new Error("This file is not rendered as pages");
    return await renderPage(file, kind, page, dpi);
  });

  plugin.handle(getRows, async ({ workspaceId, relPath, sheet, offset, limit }, { paseo }) => {
    const { file, kind } = await locate(paseo, workspaceId, relPath);
    if (kind !== "sheet") throw new Error("This file is not a spreadsheet");
    return await readRows(file, sheet, offset, limit);
  });

  plugin.addWorkspacePanel({
    id: "files",
    title: "Viewer",
    icon: "FileText",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: FileViewerPanel,
  });

  plugin.addCommandCenterItem({
    id: "open-viewer",
    title: "Open file viewer",
    icon: "FileText",
    context: "workspace",
    keywords: ["pdf", "document", "spreadsheet", "image", "view"],
    onSelect({ openPanel }) {
      openPanel("files");
    },
  });

  return () => {};
}
