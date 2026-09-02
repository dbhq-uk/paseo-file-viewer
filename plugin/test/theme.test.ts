import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { humanSize, KIND_LABEL } from "../client/theme.client.js";

describe("humanSize", () => {
  it("formats bytes through to gigabytes", () => {
    assert.equal(humanSize(0), "0 B");
    assert.equal(humanSize(512), "512 B");
    assert.equal(humanSize(2048), "2.0 KB");
    assert.equal(humanSize(1024 * 1024 * 3.5), "3.5 MB");
    assert.equal(humanSize(1024 ** 3 * 2), "2.0 GB");
  });

  it("drops the decimal once the number is large enough to not need it", () => {
    assert.equal(humanSize(1024 * 250), "250 KB");
  });
});

describe("KIND_LABEL", () => {
  it("labels every file kind the viewer can open", () => {
    assert.deepEqual(Object.keys(KIND_LABEL).sort(), ["document", "image", "pdf", "sheet"]);
  });
});
