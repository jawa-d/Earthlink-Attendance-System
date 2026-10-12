import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import config from "../next.config";
import { handle, HttpError, sameOrigin } from "../src/lib/http";
import { pageNumber } from "../src/lib/validation";
import { securityEvent } from "../src/lib/security-events";
import { reportOperatorFailure } from "../scripts/operator-error";
import { employeeSchema, qrUrl } from "../src/lib/validation";
beforeEach(() => { vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_URL", "https://synthetic.invalid"); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("HTTP configuration, privacy and security telemetry", () => {
  it("all API successes, downloads and errors are private and noncacheable", async () => {
    for (const action of [async () => Response.json({ synthetic: true }), async () => new Response(new Uint8Array([1])), async () => { throw new HttpError(403, "denied"); }, async () => { throw new SyntaxError("private parser message"); }]) {
      const response = await handle(action);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });
  it("database exceptions expose neither credentials nor internal paths to clients or logs", async () => {
    const secret = "postgresql://fake:synthetic-secret@synthetic.invalid/private";
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await handle(async () => { throw new Prisma.PrismaClientInitializationError(`Can't reach database server ${secret}`, "synthetic"); });
    expect(response.status).toBe(500); expect(await response.text()).not.toContain(secret);
    expect(JSON.stringify(log.mock.calls)).toBe('[["PrismaClientInitializationError: database-unreachable"]]');
  });
  it("operator failure reporting never prints raw database or credential errors", () => {
    const before = process.exitCode;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      reportOperatorFailure(new Error("postgresql://synthetic:private-fixture-secret@synthetic.invalid"));
      expect(process.exitCode).toBe(1);
      expect(JSON.stringify(log.mock.calls)).not.toContain("private-fixture-secret");
      expect(JSON.stringify(log.mock.calls)).not.toContain("postgresql://");
    } finally { process.exitCode = before; }
  });
  it("strips privilege/prototype/ownership fields from employee mutations", () => {
    const value = JSON.parse('{"employeeNumber":"synthetic","fullName":"Synthetic Employee","normalizedEmail":"synthetic@earthlink.iq","departmentId":"00000000-0000-4000-8000-000000000001","role":"SUPER_ADMIN","deletedAt":"1900-01-01","__proto__":{"polluted":true},"lastSuccessfulAttendanceAt":"2099-01-01"}');
    const data = employeeSchema.parse(value);
    expect(data).not.toHaveProperty("role"); expect(data).not.toHaveProperty("deletedAt"); expect(data).not.toHaveProperty("lastSuccessfulAttendanceAt");
    expect(Object.hasOwn(data, "__proto__")).toBe(false); expect(Object.prototype).not.toHaveProperty("polluted");
  });
  it("documents QR configuration failure when QR_BASE_URL is absent", () => {
    vi.stubEnv("QR_BASE_URL", ""); expect(() => qrUrl()).toThrow();
  });
  it("missing or unsafe production APP_URL fails closed", async () => {
    for (const value of ["", "http://localhost:3000", "not a url", "https://user:password@synthetic.invalid", "file:///etc/passwd"]) {
      vi.stubEnv("APP_URL", value);
      const response = await handle(async () => { sameOrigin(new Request("https://synthetic.invalid/api", { headers: { origin: "http://localhost:3000" } })); return Response.json({ ok: true }); });
      expect(response.status).toBe(503);
    }
  });
  it.each([undefined, "null", "https://synthetic.invalid.attacker.example", "https://synthetic.invalid:444", "http://synthetic.invalid"])("rejects absent/null/deceptive/wrong-port/scheme origin %s", origin => {
    expect(() => sameOrigin(new Request("https://synthetic.invalid/api", { headers: origin ? { origin } : {} }))).toThrow(expect.objectContaining({ status: 403 }));
  });
  it("does not trust spoofed Host or forwarded host when checking origin", () => {
    expect(() => sameOrigin(new Request("https://attacker.invalid/api", { headers: { origin: "https://attacker.invalid", host: "attacker.invalid", "x-forwarded-host": "attacker.invalid" } }))).toThrow();
    expect(() => sameOrigin(new Request("https://synthetic.invalid/api", { headers: { origin: "https://synthetic.invalid" } }))).not.toThrow();
  });
  it.each(["Infinity", "NaN", "-1", "1.5", "1000001", "1; DROP TABLE Employee"])("rejects unsafe pagination %s", page => {
    expect(() => pageNumber(new URLSearchParams({ page }))).toThrow();
  });
  it("security events contain fixed names and pseudonyms, never raw request identities", () => {
    vi.stubEnv("AUTH_SECRET", "synthetic private test secret".repeat(3));
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const subject = "synthetic@example.invalid\nforged-log-entry";
    securityEvent("LOGIN_FAILURE", subject);
    const output = JSON.parse(log.mock.calls[0][0]);
    expect(Object.keys(output).sort()).toEqual(["at", "event", "subjectHash"]);
    expect(output.subjectHash).toMatch(/^[a-f0-9]{64}$/);
    expect(log.mock.calls[0][0]).not.toContain(subject); expect(output.event).toBe("LOGIN_FAILURE");
  });
  it("production headers disable framing, plugins, MIME sniffing and unsafe-eval", async () => {
    const rules = await config.headers!(); const map = Object.fromEntries(rules[0].headers.map(h => [h.key, h.value]));
    expect(map["X-Content-Type-Options"]).toBe("nosniff"); expect(map["X-Frame-Options"]).toBe("DENY");
    expect(map["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    expect(map["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(map["Content-Security-Policy"]).not.toContain("'unsafe-eval'"); expect(map["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(config.poweredByHeader).toBe(false);
  });
});
