import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { extractDocuments, MAX_DOC_CHARS } from "../server/documents/extract";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "edublaxk-extract-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Minimal single-page PDF whose content stream draws the text "EDUBLAXK-SAMPLE".
const SAMPLE_PDF_BASE64 = Buffer.from(
  `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
4 0 obj << /Length 62 >> stream
BT /F1 12 Tf 10 50 Td (EDUBLAXK-SAMPLE) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R >>
%%EOF`,
  "utf-8"
).toString("base64");

describe("extractDocuments", () => {
  it("passes text files through unchanged", async () => {
    const result = await extractDocuments(
      [{ name: "notes.txt", type: "text/plain", textContent: "hello world" }],
      tmpDir
    );
    expect(result).toEqual([{ name: "notes.txt", text: "hello world", truncated: false }]);
  });

  it("extracts text from a PDF and caches it by content hash", async () => {
    const first = await extractDocuments(
      [{ name: "sample.pdf", type: "application/pdf", base64: SAMPLE_PDF_BASE64 }],
      tmpDir
    );
    expect(first[0].text.toUpperCase()).toContain("EDUBLAXK-SAMPLE");

    const cacheFiles = fs.readdirSync(path.join(tmpDir, "doc-cache"));
    expect(cacheFiles).toHaveLength(1);
    expect(cacheFiles[0]).toMatch(/^[a-f0-9]{64}\.txt$/);

    // Second extraction of the identical file must hit the cache (same output).
    const second = await extractDocuments(
      [{ name: "renamed.pdf", type: "application/pdf", base64: SAMPLE_PDF_BASE64 }],
      tmpDir
    );
    expect(second[0].text).toBe(first[0].text);
    expect(fs.readdirSync(path.join(tmpDir, "doc-cache"))).toHaveLength(1);
  });

  it("strips a data-URL prefix from base64 before hashing and decoding", async () => {
    const withPrefix = `data:application/pdf;base64,${SAMPLE_PDF_BASE64}`;
    const result = await extractDocuments(
      [{ name: "sample.pdf", type: "application/pdf", base64: withPrefix }],
      tmpDir
    );
    expect(result[0].text.toUpperCase()).toContain("EDUBLAXK-SAMPLE");
  });

  it("truncates documents over the character cap and flags them", async () => {
    const longText = "a".repeat(MAX_DOC_CHARS + 5000);
    const result = await extractDocuments(
      [{ name: "big.txt", type: "text/plain", textContent: longText }],
      tmpDir
    );
    expect(result[0].truncated).toBe(true);
    expect(result[0].text).toHaveLength(MAX_DOC_CHARS);
  });

  it("skips files with neither base64 PDF nor textContent", async () => {
    const result = await extractDocuments([{ name: "mystery.bin", type: "application/octet-stream" }], tmpDir);
    expect(result).toEqual([]);
  });
});
