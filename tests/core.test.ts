import { describe, it, expect } from "vitest";
import {
  corporateEmail,
  businessDate,
  attendanceSchema,
  dateSchema,
  qrUrl,
} from "../src/lib/validation";
import { permitted, tokenHash } from "../src/lib/auth";
import { sameOrigin } from "../src/lib/http";
import { hash, verify } from "@node-rs/argon2";
import QRCode from "qrcode";
import ExcelJS from "exceljs";
import { spreadsheet, pdfReport } from "../src/lib/export";
describe("corporate email", () => {
  it("normalizes case and whitespace", () =>
    expect(corporateEmail.parse("  Person@EARTHLINK.IQ  ")).toBe(
      "person@earthlink.iq",
    ));
  it.each([
    "person@gmail.com",
    "person@earthlink.iq.evil.com",
    "person@evil-earthlink.iq",
    "person@sub.earthlink.iq",
    "person@earthlink.iq@evil.com",
    "person",
    "",
  ])("rejects %s", (value) =>
    expect(corporateEmail.safeParse(value).success).toBe(false),
  );
});
describe("Baghdad calendar", () => {
  it("changes day at 21:00 UTC", () => {
    expect(businessDate(new Date("2026-10-10T20:59:59Z"))).toBe("2026-10-10");
    expect(businessDate(new Date("2026-10-10T21:00:00Z"))).toBe("2026-10-11");
  });
  it("rejects impossible dates", () =>
    expect(dateSchema.safeParse("2026-02-30").success).toBe(false));
  it("requires reasons and consistent timestamps", () => {
    const base = {
      employeeId: "38f20893-7242-4f23-a144-5026dc22e112",
      attendanceDate: "2026-10-11",
      status: "PRESENT",
      reason: "تصحيح إداري",
    };
    expect(
      attendanceSchema.safeParse({
        ...base,
        checkInAt: "2026-10-11T08:00:00+03:00",
      }).success,
    ).toBe(true);
    expect(
      attendanceSchema.safeParse({ ...base, checkInAt: "2026-10-10T08:00:00Z" })
        .success,
    ).toBe(false);
    expect(attendanceSchema.safeParse({ ...base, reason: "" }).success).toBe(
      false,
    );
  });
});
describe("administrator security", () => {
  it("enforces roles", () => {
    expect(permitted("VIEWER", "write")).toBe(false);
    expect(permitted("ADMIN", "super")).toBe(false);
    expect(permitted("VIEWER", "read")).toBe(true);
    expect(permitted("SUPER_ADMIN", "super")).toBe(true);
  });
  it("hashes session identifiers with a secret", () => {
    process.env.AUTH_SECRET = "x".repeat(32);
    expect(tokenHash("session")).not.toBe("session");
    expect(tokenHash("session")).toHaveLength(64);
  });
  it("rejects cross-origin mutations", () => {
    process.env.APP_URL = "https://attendance.example.com";
    expect(() =>
      sameOrigin(
        new Request("https://attendance.example.com", {
          headers: { origin: "https://evil.com" },
        }),
      ),
    ).toThrow();
    expect(() =>
      sameOrigin(
        new Request("https://attendance.example.com", {
          headers: { origin: "https://attendance.example.com" },
        }),
      ),
    ).not.toThrow();
  });
  it("uses Argon2id and rejects wrong passwords", async () => {
    const stored = await hash("a long private password");
    expect(stored).toContain("$argon2id$");
    expect(await verify(stored, "wrong")).toBe(false);
    expect(await verify(stored, "a long private password")).toBe(true);
  });
});
describe("exports", () => {
  it("generates a real Excel workbook with summary", async () => {
    const buffer = await spreadsheet([
      [
        "12",
        "موظف",
        "a@earthlink.iq",
        "قسم",
        "2026-10-11",
        "08:00",
        "حاضر",
        "QR",
      ],
    ]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as never);
    expect(book.worksheets[0].rowCount).toBe(2);
    expect(book.worksheets[0].getCell("C2").text).toBe("a@earthlink.iq");
    expect(book.worksheets[1].getCell("B1").value).toBe(1);
  });
  it("generates permanent QR PNG with production URL", async () => {
    process.env.QR_BASE_URL = "https://attendance.example.com";
    expect(qrUrl()).toBe("https://attendance.example.com/attendance");
    const png = await QRCode.toBuffer(qrUrl(), { width: 1600, margin: 4 });
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    process.env.QR_BASE_URL = "http://localhost:3000";
    expect(qrUrl).toThrow();
  });
  it("generates a PDF using embedded Arabic font", async () => {
    const pdf = await pdfReport("تقرير الحضور", [
      [
        "1",
        "موظف تجريبي",
        "test@earthlink.iq",
        "قسم",
        "2026-10-11",
        "08:00",
        "حاضر",
        "QR",
      ],
    ]);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(5000);
  });
});
