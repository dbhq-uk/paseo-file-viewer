import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellText } from "../server/office.js";

/**
 * Spreadsheet cells arrive in a dozen shapes. These are unit tests rather than
 * fixture tests because some shapes - a formula with a cached result - cannot
 * be produced by writing a workbook with exceljs.
 */
describe("cellText", () => {
  it("renders empty cells as an empty string", () => {
    assert.equal(cellText(null), "");
    assert.equal(cellText(undefined as never), "");
  });

  it("renders plain values", () => {
    assert.equal(cellText("widget"), "widget");
    assert.equal(cellText(1234), "1234");
    assert.equal(cellText(0), "0");
    assert.equal(cellText(false as never), "false");
  });

  it("renders a date as a plain date", () => {
    assert.equal(cellText(new Date("2026-01-14T09:30:00Z")), "2026-01-14");
  });

  it("renders rich text as its concatenated runs", () => {
    assert.equal(cellText({ richText: [{ text: "Total " }, { text: "due" }] } as never), "Total due");
  });

  it("prefers a cached formula result over the expression", () => {
    assert.equal(cellText({ formula: "B2-C2", result: 13500 } as never), "13500");
  });

  it("renders a zero result rather than treating it as absent", () => {
    assert.equal(cellText({ formula: "B2-C2", result: 0 } as never), "0");
  });

  it("shows the expression when no result was cached, rather than a blank cell", () => {
    // The defect this covers: an uncached formula rendered as "" makes a
    // populated column look empty and gives no clue why.
    assert.equal(cellText({ formula: "B2-C2" } as never), "=B2-C2");
    assert.equal(cellText({ sharedFormula: "A1*2" } as never), "=A1*2");
  });

  it("renders a formula error as the error code", () => {
    assert.equal(cellText({ formula: "1/0", result: { error: "#DIV/0!" } } as never), "#DIV/0!");
    assert.equal(cellText({ error: "#REF!" } as never), "#REF!");
  });

  it("renders a hyperlink as its display text", () => {
    assert.equal(cellText({ text: "Invoice", hyperlink: "https://example.com" } as never), "Invoice");
    assert.equal(cellText({ hyperlink: "https://example.com" } as never), "https://example.com");
  });
});
