import ExcelJS from "exceljs";
import PdfPrinter from "pdfmake";
import type { TDocumentDefinitions, TableCell } from "pdfmake/interfaces";
import path from "node:path";
export const statusNames: Record<string, string> = {
  PRESENT: "حاضر",
  LATE: "متأخر",
  ABSENT: "غائب",
  EXCUSED: "بعذر",
  UNREGISTERED: "لم يسجل الحضور",
};
export const headers = [
  "الرقم الوظيفي",
  "الاسم",
  "البريد الوظيفي",
  "القسم",
  "التاريخ",
  "الوقت",
  "الحالة",
  "الطريقة",
];
export async function spreadsheet(rows: (string | number)[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("الحضور", { views: [{ rightToLeft: true }] });
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  sheet.columns.forEach((c, i) => {
    c.width = [18, 28, 36, 24, 18, 20, 22, 16][i];
  });
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF183153" },
  };
  sheet.autoFilter = { from: "A1", to: "H1" };
  const summary = book.addWorksheet("الملخص");
  summary.addRow(["إجمالي السجلات", rows.length]);
  Object.entries(statusNames).forEach(([, label]) =>
    summary.addRow([label, rows.filter((r) => r[6] === label).length]),
  );
  return Buffer.from(await book.xlsx.writeBuffer());
}
// PDFKit shapes Arabic glyphs through the embedded OpenType font. Reverse word
// order for pdfmake's left-to-right line layout while retaining each Arabic word.
export function rtl(s: string) {
  return /[\u0600-\u06ff]/.test(s) ? s.split(" ").reverse().join(" ") : s;
}
export async function pdfReport(title: string, rows: string[][], qr?: string) {
  const font = path.join(process.cwd(), "public/fonts/NotoSansArabic.ttf");
  const printer = new PdfPrinter({
    Arabic: { normal: font, bold: font, italics: font, bolditalics: font },
  });
  const table: TableCell[][] = [
    headers
      .slice()
      .reverse()
      .map((s) => ({ text: rtl(s), bold: true, fillColor: "#e2e8f0" })),
    ...rows.map((r) =>
      r
        .slice()
        .reverse()
        .map((s) => ({ text: rtl(s), alignment: "right" as const })),
    ),
  ];
  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: qr ? "portrait" : "landscape",
    pageMargins: [28, 35, 28, 35],
    defaultStyle: { font: "Arabic", fontSize: 8, alignment: "right" },
    content: [
      { text: rtl(title), fontSize: 22, bold: true, margin: [0, 0, 0, 16] },
      {
        text: rtl(
          `تاريخ الإنشاء: ${new Date().toLocaleString("ar-IQ", { timeZone: "Asia/Baghdad" })}`,
        ),
        margin: [0, 0, 0, 16],
      },
      ...(qr
        ? [
            {
              image: qr,
              width: 340,
              alignment: "center" as const,
              margin: [0, 50, 0, 30] as [number, number, number, number],
            },
            {
              text: rtl(
                "يرجى مسح رمز QR وإدخال البريد الإلكتروني الوظيفي لتسجيل الحضور اليومي.",
              ),
              fontSize: 15,
              alignment: "center" as const,
            },
          ]
        : [
            {
              text: rtl(`إجمالي السجلات: ${rows.length}`),
              margin: [0, 0, 0, 10] as [number, number, number, number],
            },
            {
              table: {
                headerRows: 1,
                widths: [50, 55, 65, 65, 80, 140, 95, 60],
                body: table,
              },
              layout: "lightHorizontalLines",
            },
          ]),
    ],
    footer: (page, pages) => ({
      text: `${page} / ${pages}`,
      alignment: "center",
      fontSize: 8,
    }),
  };
  const pdf = printer.createPdfKitDocument(doc);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.end();
  });
}
