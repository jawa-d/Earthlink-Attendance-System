import QRCode from "qrcode";
import { authorize } from "@/lib/auth";
import { handle } from "@/lib/http";
import { qrUrl } from "@/lib/validation";
import { pdfReport } from "@/lib/export";
export async function GET(req: Request) {
  return handle(async () => {
    await authorize("write");
    const url = qrUrl();
    const format = new URL(req.url).searchParams.get("format");
    if (!format)
      return Response.json({
        url,
        image: await QRCode.toDataURL(url, {
          width: 1200,
          margin: 4,
          errorCorrectionLevel: "H",
        }),
      });
    const buffer =
      format === "pdf"
        ? await pdfReport(
            "نظام تسجيل الحضور — Earthlink",
            [],
            await QRCode.toDataURL(url, {
              width: 1600,
              margin: 4,
              errorCorrectionLevel: "H",
            }),
          )
        : await QRCode.toBuffer(url, {
            width: 1600,
            margin: 4,
            errorCorrectionLevel: "H",
          });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "image/png",
        "Content-Disposition": `attachment; filename="earthlink-qr.${format === "pdf" ? "pdf" : "png"}"`,
      },
    });
  });
}
