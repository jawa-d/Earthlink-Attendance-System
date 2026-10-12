import { describe, expect, it, vi } from "vitest";
import { JSON_BODY_LIMIT, readBody, readJson, readImportForm } from "../src/lib/request-body";

const request = (body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("https://synthetic.invalid/api", { method: "POST", headers, body });
describe("bounded requests before parsing or database access", () => {
  it("rejects declared oversize before reading a body", async () => {
    const req = request("{}", { "content-type": "application/json", "content-length": String(JSON_BODY_LIMIT + 1) });
    await expect(readJson(req)).rejects.toMatchObject({ status: 413 });
    expect(req.bodyUsed).toBe(false);
  });
  it.each([undefined, "1"])("counts actual bytes even with missing or forged length %s", async length => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(JSON_BODY_LIMIT)); controller.enqueue(new Uint8Array(1)); }, cancel });
    const req = new Request("https://synthetic.invalid/api", {
      method: "POST", headers: { "content-type": "application/json", ...(length ? { "content-length": length } : {}) },
      body: stream, duplex: "half",
    } as RequestInit);
    await expect(readJson(req)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalled();
  });
  it.each(["null", "[]", "true", "1", "\"text\"", "{"])("rejects nonobject/malformed JSON %s as 400", async body => {
    await expect(readJson(request(body))).rejects.toMatchObject({ status: 400 });
  });
  it("accepts bounded UTF-8 JSON and multipart uploads", async () => {
    expect(await readJson(request('{"name":"موظف"}'))).toEqual({ name: "موظف" });
    const form = new FormData(); form.set("reason", "synthetic import"); form.set("file", new File(["synthetic"], "fixture.xlsx"));
    const result = await readImportForm(new Request("https://synthetic.invalid/api", { method: "POST", body: form }));
    expect(result.get("reason")).toBe("synthetic import");
    expect((result.get("file") as File).size).toBe(9);
  });
  it("rejects wrong media types and malformed multipart", async () => {
    await expect(readJson(request("{}", { "content-type": "text/plain" }))).rejects.toMatchObject({ status: 415 });
    await expect(readImportForm(request("not multipart", { "content-type": "multipart/form-data; boundary=fixture" }))).rejects.toMatchObject({ status: 400 });
  });
  it("counts bytes rather than JavaScript characters", async () => {
    await expect(readBody(request("ع".repeat(10)), 19)).rejects.toMatchObject({ status: 413 });
  });
});
