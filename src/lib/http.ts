import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function handle(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SyntaxError)
      return Response.json({ error: "طلب JSON غير صالح" }, { status: 400 });
    if (e instanceof HttpError)
      return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError)
      return Response.json(
        { error: "يرجى مراجعة البيانات المدخلة", details: e.issues },
        { status: 400 },
      );
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return Response.json({ error: "السجل موجود مسبقاً" }, { status: 409 });
    // Classify initialization failures without logging connection strings or messages.
    if (e instanceof Prisma.PrismaClientInitializationError) {
      const category = /Environment variable not found/.test(e.message)
        ? "missing-environment"
        : /Can't reach database server/.test(e.message)
          ? "database-unreachable"
          : /Authentication failed/.test(e.message)
            ? "database-credentials-rejected"
            : "initialization-failed";
      console.error(`PrismaClientInitializationError: ${category}`);
    } else console.error(e instanceof Error ? e.name : "Server error");
    return Response.json(
      { error: "تعذر إتمام العملية. حاول لاحقاً." },
      { status: 500 },
    );
  }
}
export function sameOrigin(req: Request) {
  const expected = new URL(process.env.APP_URL || "http://localhost:3000")
    .origin;
  if (req.headers.get("origin") !== expected)
    throw new HttpError(403, "طلب غير مسموح");
}
