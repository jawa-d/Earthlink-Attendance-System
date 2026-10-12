import { ZodError } from "zod";
// Prisma and parser messages can carry connection details. Operators inspect
// their environment privately rather than printing raw exception messages.
export function reportOperatorFailure(error: unknown) {
  console.error(error instanceof ZodError
    ? "Operator configuration validation failed. Check required environment keys privately."
    : "Operator operation failed. Check connection, privileges and configuration privately; diagnostic details suppressed.");
  process.exitCode = 1;
}
