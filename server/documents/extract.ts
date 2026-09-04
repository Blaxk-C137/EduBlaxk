import crypto from "crypto";
import fs from "fs";
import path from "path";
import { extractText, getDocumentProxy } from "unpdf";
import { dataDir } from "../config/keys";

export const MAX_DOC_CHARS = 120_000;

export interface ExtractedDoc {
  name: string;
  text: string;
  truncated: boolean;
}

export interface RawUpload {
  name: string;
  type?: string;
  base64?: string;
  textContent?: string;
}

function cacheDir(baseDir?: string): string {
  return path.join(dataDir(baseDir), "doc-cache");
}

function decodeBase64(base64: string): Buffer {
  return Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
}

export function hashBytes(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export async function extractDocuments(files: RawUpload[], baseDir?: string): Promise<ExtractedDoc[]> {
  const dir = cacheDir(baseDir);
  fs.mkdirSync(dir, { recursive: true });

  const results: ExtractedDoc[] = [];
  for (const file of files) {
    let text: string;

    if (file.base64 && file.type?.includes("pdf")) {
      const bytes = decodeBase64(file.base64);
      const cacheFile = path.join(dir, `${hashBytes(bytes)}.txt`);
      if (fs.existsSync(cacheFile)) {
        text = fs.readFileSync(cacheFile, "utf-8");
      } else {
        const pdf = await getDocumentProxy(new Uint8Array(bytes));
        const { text: parsed } = await extractText(pdf, { mergePages: true });
        text = parsed;
        fs.writeFileSync(cacheFile, text, { mode: 0o600 });
      }
    } else if (file.textContent) {
      text = file.textContent;
    } else {
      continue; // Unusable upload — skip rather than send garbage to the model.
    }

    const truncated = text.length > MAX_DOC_CHARS;
    results.push({
      name: file.name,
      text: truncated ? text.slice(0, MAX_DOC_CHARS) : text,
      truncated,
    });
  }
  return results;
}
