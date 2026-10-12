import { HttpError } from "./http";

export const JSON_BODY_LIMIT = 64 * 1024;
// A supported deletion selection can contain 5000 UUIDs (~195 KiB JSON).
export const DELETION_BODY_LIMIT = 256 * 1024;
export const IMPORT_BODY_LIMIT = 2_100_000;

// Content-Length is only an early rejection. Count bytes from the stream too,
// including chunked requests and clients lying about their declared length.
export async function readBody(req: Request, limit: number): Promise<Uint8Array> {
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit))
    throw new HttpError(413, "حجم الطلب أكبر من الحد المسموح");
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => undefined);
        throw new HttpError(413, "حجم الطلب أكبر من الحد المسموح");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function readJson(req: Request, limit = JSON_BODY_LIMIT): Promise<Record<string, unknown>> {
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new HttpError(415, "نوع الطلب يجب أن يكون JSON");
  const bytes = await readBody(req, limit);
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new HttpError(400, "طلب JSON غير صالح"); }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "طلب JSON يجب أن يكون كائناً");
  return value as Record<string, unknown>;
}

export async function readImportForm(req: Request): Promise<FormData> {
  if (!/^multipart\/form-data\s*;/i.test(req.headers.get("content-type") || ""))
    throw new HttpError(415, "طلب ملف multipart مطلوب");
  const bytes = await readBody(req, IMPORT_BODY_LIMIT);
  try {
    return await new Request(req.url, { method: "POST", headers: req.headers, body: bytes as BodyInit }).formData();
  } catch { throw new HttpError(400, "طلب ملف غير صالح"); }
}
