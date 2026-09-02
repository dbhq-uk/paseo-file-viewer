import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { safeResolve, workspaceRoot } from "../server/paths.js";

let root: string;
let outside: string;

before(async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), "fv-paths-")));
  root = join(base, "workspace");
  outside = join(base, "outside");
  await mkdir(join(root, "sub"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(root, "sub", "ok.pdf"), "x");
  await writeFile(join(outside, "secret.pdf"), "x");
  await symlink(join(outside, "secret.pdf"), join(root, "escape.pdf"));
  await symlink(outside, join(root, "escapedir"));
});

describe("safeResolve", () => {
  it("allows a file inside the workspace", async () => {
    const resolved = await safeResolve(root, "sub/ok.pdf");
    assert.equal(resolved, join(root, "sub", "ok.pdf"));
  });

  it("refuses parent traversal", async () => {
    await assert.rejects(() => safeResolve(root, "../outside/secret.pdf"), /escapes the workspace/);
  });

  it("refuses an absolute path outside the workspace", async () => {
    await assert.rejects(() => safeResolve(root, join(outside, "secret.pdf")), /escapes the workspace/);
  });

  it("refuses a symlinked file pointing outside", async () => {
    // The literal path looks contained; only resolving the link reveals it is not.
    await assert.rejects(() => safeResolve(root, "escape.pdf"), /escapes the workspace/);
  });

  it("refuses a path through a symlinked directory", async () => {
    await assert.rejects(() => safeResolve(root, "escapedir/secret.pdf"), /escapes the workspace/);
  });

  it("refuses an embedded null byte", async () => {
    await assert.rejects(() => safeResolve(root, "sub/ok.pdf\0.png"), /Invalid path/);
  });

  it("refuses a path that does not exist", async () => {
    await assert.rejects(() => safeResolve(root, "nope.pdf"));
  });
});

describe("workspaceRoot", () => {
  const paseo = (entries: unknown[]) => ({ workspaces: { list: async () => ({ entries }) } });

  it("resolves a workspace id to its directory", async () => {
    const found = await workspaceRoot(paseo([{ id: "w1", workspaceDirectory: root }]), "w1");
    assert.equal(found, root);
  });

  it("falls back to the project root when there is no workspace directory", async () => {
    const found = await workspaceRoot(paseo([{ id: "w1", projectRootPath: root }]), "w1");
    assert.equal(found, root);
  });

  it("rejects an unknown workspace", async () => {
    await assert.rejects(() => workspaceRoot(paseo([]), "missing"), /Unknown workspace/);
  });
});
