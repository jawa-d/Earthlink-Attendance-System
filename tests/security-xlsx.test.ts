import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { validateXlsxArchive } from "../src/lib/xlsx-safety";
import { spreadsheet } from "../src/lib/export";

async function zip(content: string, name = "xl/worksheets/sheet1.xml") {
  const file = new JSZip();
  file.file("[Content_Types].xml", "<Types/>"); file.file("xl/workbook.xml", "<workbook/>"); file.file(name, content);
  return file.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
describe("Excel import decompression limits", () => {
  it("accepts a real exported workbook, including a 500 employee template", async () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Employees");
    sheet.addRow(["employeeNumber", "fullName", "normalizedEmail", "departmentId", "status"]);
    for (let i = 0; i < 500; i++) sheet.addRow([String(i), "Synthetic الموظف", `synthetic${i}@earthlink.iq`, "00000000-0000-4000-8000-000000000001", "ACTIVE"]);
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    expect(() => validateXlsxArchive(bytes)).not.toThrow();
    const read = new ExcelJS.Workbook(); await read.xlsx.load(bytes as never);
    expect(read.worksheets[0].rowCount).toBe(501);
  });
  it("rejects a compressed payload exceeding the per-entry budget", async () => {
    const bytes = await zip("x".repeat(8 * 1024 * 1024 + 1));
    expect(bytes.length).toBeLessThan(2_000_000);
    expect(() => validateXlsxArchive(bytes)).toThrow(expect.objectContaining({ status: 400 }));
    // Forged directory size claims must not evade the actual inflater limit.
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), bytes.indexOf(Buffer.from("xl/worksheets/sheet1.xml")) + 1);
    let offset = central;
    while (offset >= 0) {
      const nameLength = bytes.readUInt16LE(offset + 28);
      if (bytes.subarray(offset + 46, offset + 46 + nameLength).toString() === "xl/worksheets/sheet1.xml") { bytes.writeUInt32LE(1, offset + 24); break; }
      offset = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset + 4);
    }
    expect(offset).toBeGreaterThan(0);
    expect(() => validateXlsxArchive(bytes)).toThrow(expect.objectContaining({ status: 400 }));
  });
  it("rejects excessive total expansion and ZIP entry counts", async () => {
    const file = new JSZip(); file.file("[Content_Types].xml", "<Types/>"); file.file("xl/workbook.xml", "<workbook/>");
    for (let i = 0; i < 3; i++) file.file(`xl/worksheets/${i}.xml`, "x".repeat(6 * 1024 * 1024));
    expect(() => validateXlsxArchive(Buffer.from([]))).toThrow();
    const expanded = await file.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    expect(() => validateXlsxArchive(expanded)).toThrow(expect.objectContaining({ status: 400 }));
    const many = new JSZip(); for (let i = 0; i < 201; i++) many.file(`entry${i}`, "x");
    const bytes = await many.generateAsync({ type: "nodebuffer" });
    expect(() => validateXlsxArchive(bytes)).toThrow();
  });
  it.each(["<!DOCTYPE x [<!ENTITY bomb 'value'>]><x/>", "<!ENTITY x 'value'>"])("rejects XML entity declarations", async content => {
    const bytes = await zip(content);
    expect(() => validateXlsxArchive(bytes)).toThrow(expect.objectContaining({ status: 400 }));
  });
  it.each(["../outside.xml", "xl/vbaProject.bin"])("rejects unsupported unsafe archive content %s", async name => {
    const bytes = await zip("fixture", name);
    expect(() => validateXlsxArchive(bytes)).toThrow();
  });
  it("exports formula-like strings as literal text without formulas or links", async () => {
    const payloads = ["=HYPERLINK(\"https://invalid.example\",\"fixture\")", "+SUM(1,1)", "-1+1", "@SUM(1,1)", "\t=1+1"];
    const bytes = await spreadsheet([payloads], "Synthetic export", payloads.map((_, i) => String(i)));
    const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes as never);
    payloads.forEach((value, i) => {
      const cell = book.worksheets[0].getRow(3).getCell(i + 1);
      expect(cell.type).toBe(ExcelJS.ValueType.String); expect(cell.value).toBe(value); expect(cell.formula).toBeUndefined();
    });
  });
});
