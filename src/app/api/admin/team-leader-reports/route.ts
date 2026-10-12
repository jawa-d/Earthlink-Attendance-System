import { authorize } from "@/lib/auth";
import { handle } from "@/lib/http";
import { getLeaderReport } from "@/lib/leader-report-service";
import { pageNumber } from "@/lib/validation";
export async function GET(req: Request) {
  return handle(async () => {
    await authorize("read");
    const p = new URL(req.url).searchParams;
    const page = pageNumber(p);
    const result = await getLeaderReport(p);
    return Response.json(
      {
        ...result,
        rows: result.rows.slice((page - 1) * 25, page * 25),
        total: result.rows.length,
        page,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
