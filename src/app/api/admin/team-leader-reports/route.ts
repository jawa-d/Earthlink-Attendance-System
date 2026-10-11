import { authorize } from "@/lib/auth";
import { handle } from "@/lib/http";
import { getLeaderReport } from "@/lib/leader-report-service";
export async function GET(req: Request) {
  return handle(async () => {
    await authorize("read");
    const p = new URL(req.url).searchParams;
    const result = await getLeaderReport(p);
    const page = Math.max(1, Math.floor(Number(p.get("page")) || 1));
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
