import { inflateRawSync } from "node:zlib";
import { HttpError } from "./http";

const MAX_EXPANDED = 16 * 1024 * 1024;
const MAX_ENTRY = 8 * 1024 * 1024;
const MAX_ENTRIES = 200;

// Validate and actually decompress each bounded ZIP entry before ExcelJS sees
// it. ZIP central-directory size claims alone do not stop a forged ZIP bomb.
export function validateXlsxArchive(bytes: Buffer) {
  const invalid = () => new HttpError(400, "ملف Excel غير صالح أو يتجاوز حدود المعالجة الآمنة");
  try {
    if (bytes.length < 22 || bytes.length > 2_000_000) throw invalid();
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
    }
    if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw invalid();
    const count = bytes.readUInt16LE(end + 10);
    const directorySize = bytes.readUInt32LE(end + 12);
    let cursor = bytes.readUInt32LE(end + 16);
    if (!count || count > MAX_ENTRIES || count !== bytes.readUInt16LE(end + 8) || cursor + directorySize !== end) throw invalid();
    const names = new Set<string>();
    const ranges: [number, number][] = [];
    let expanded = 0;
    for (let entry = 0; entry < count; entry++) {
      if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw invalid();
      const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
      const compressed = bytes.readUInt32LE(cursor + 20), uncompressed = bytes.readUInt32LE(cursor + 24);
      const nameLength = bytes.readUInt16LE(cursor + 28), extraLength = bytes.readUInt16LE(cursor + 30), commentLength = bytes.readUInt16LE(cursor + 32);
      const local = bytes.readUInt32LE(cursor + 42);
      if (flags & 1 || ![0, 8].includes(method) || bytes.readUInt16LE(cursor + 34) || uncompressed > MAX_ENTRY || cursor + 46 + nameLength + extraLength + commentLength > end) throw invalid();
      const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
      const name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
      if (!name || names.has(name) || name.includes("\\") || name.includes("\0") || name.startsWith("/") || name.split("/").includes("..") || /vbaproject\.bin$/i.test(name)) throw invalid();
      names.add(name);
      if (local + 30 > end || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) throw invalid();
      const localNameLength = bytes.readUInt16LE(local + 26), localExtraLength = bytes.readUInt16LE(local + 28);
      const start = local + 30 + localNameLength + localExtraLength;
      if (start + compressed > bytes.readUInt32LE(end + 16) || !bytes.subarray(local + 30, local + 30 + localNameLength).equals(nameBytes)) throw invalid();
      if (ranges.some(([a, b]) => local < b && start + compressed > a)) throw invalid();
      ranges.push([local, start + compressed]);
      const payload = bytes.subarray(start, start + compressed);
      const content = method === 0 ? payload : inflateRawSync(payload, { maxOutputLength: Math.min(MAX_ENTRY, MAX_EXPANDED - expanded) });
      expanded += content.length;
      if (content.length !== uncompressed || expanded > MAX_EXPANDED) throw invalid();
      if (name.endsWith(".xml") && /<!DOCTYPE|<!ENTITY/i.test(content.toString("utf8"))) throw invalid();
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    if (cursor !== end || !names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) throw invalid();
  } catch { throw invalid(); }
}
