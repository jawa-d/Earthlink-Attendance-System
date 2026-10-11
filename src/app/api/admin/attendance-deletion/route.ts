import { z } from "zod";
import { authorize, currentSessionId } from "@/lib/auth";
import { handle, sameOrigin } from "@/lib/http";
import { reason } from "@/lib/validation";
import { deletionSelection, prepareDeletion, exportDeletionBackup, reauthenticateDeletion, verifyDeletionCode, permanentlyDeleteAttendance } from "@/lib/attendance-deletion";

const id = { snapshotId: z.uuid() };
const code = z.string().regex(/^[A-F0-9]{8}$/);
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), selection: deletionSelection }).strict(),
  z.object({ action: z.literal("export"), ...id }).strict(),
  z.object({ action: z.literal("reauthenticate"), ...id, password: z.string().min(1).max(256) }).strict(),
  z.object({ action: z.literal("verify"), ...id, code }).strict(),
]);
export async function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const actor = await authorize("super");
    const sessionId = await currentSessionId();
    const input = command.parse(await req.json());
    if (input.action === "export") {
      const { buffer, receipt } = await exportDeletionBackup(actor, sessionId, input.snapshotId);
      return new Response(new Uint8Array(buffer), { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="attendance-backup-${input.snapshotId}.xlsx"`,
        "X-Backup-Receipt": receipt, "Cache-Control": "private, no-store",
      } });
    }
    const result = input.action === "prepare" ? await prepareDeletion(actor, sessionId, input.selection)
      : input.action === "reauthenticate" ? await reauthenticateDeletion(actor, sessionId, input.snapshotId, input.password)
      : await verifyDeletionCode(actor, sessionId, input.snapshotId, input.code);
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  });
}
export async function DELETE(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const actor = await authorize("super");
    const sessionId = await currentSessionId();
    const input = z.object({ ...id, backupConfirmed: z.literal(true), receipt: z.string().regex(/^[a-f0-9]{64}$/), code, reason }).strict().parse(await req.json());
    return Response.json(await permanentlyDeleteAttendance(actor, sessionId, input), { headers: { "Cache-Control": "private, no-store" } });
  });
}
