import { createHmac } from "node:crypto";

type SecurityEvent = "LOGIN_SUCCESS" | "LOGIN_FAILURE" | "LOGOUT" | "AUTHORIZATION_DENIED" | "RATE_LIMIT_DENIED";
// Only fixed event names and an optional pseudonymous discriminator. Never
// log request bodies, cookies, passwords, error messages or raw identifiers.
export function securityEvent(event: SecurityEvent, subject?: string) {
  const secret = process.env.AUTH_SECRET;
  const subjectHash = subject && secret && secret.length >= 32
    ? createHmac("sha256", secret).update(`security-event:${subject}`).digest("hex")
    : undefined;
  console.info(JSON.stringify({ event, at: new Date().toISOString(), subjectHash }));
}
