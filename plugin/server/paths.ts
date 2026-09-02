import { realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";

/**
 * Resolves a workspace id to its directory on disk.
 *
 * The backend looks this up itself rather than accepting a path from the
 * client, so a compromised or buggy surface cannot widen the plugin's reach
 * by asking for a different root.
 */
export async function workspaceRoot(paseo: any, workspaceId: string): Promise<string> {
  const { entries } = await paseo.workspaces.list();
  const ws = entries.find((w: any) => w.id === workspaceId);
  if (!ws) throw new Error(`Unknown workspace: ${workspaceId}`);
  const dir = ws.workspaceDirectory ?? ws.projectRootPath;
  if (!dir) throw new Error(`Workspace ${workspaceId} has no directory on disk`);
  return await realpath(dir);
}

/**
 * Resolves a workspace-relative path and refuses anything outside the root.
 *
 * realpath runs before the containment check so that a symlink pointing out
 * of the tree is caught, not just a `../` in the literal path. Plugin
 * backends are unsandboxed, so this is the only thing keeping the viewer
 * scoped to the workspace.
 */
export async function safeResolve(root: string, relPath: string): Promise<string> {
  if (relPath.includes("\0")) throw new Error("Invalid path");
  const target = await realpath(resolve(root, relPath));
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  if (target !== root && !target.startsWith(rootPrefix)) {
    throw new Error("Path escapes the workspace");
  }
  return target;
}
