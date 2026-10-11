import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import { verify } from "@node-rs/argon2";
import { z } from "zod";
import { db } from "../src/lib/db";
config({ quiet: true });

const report: {
  completed: boolean;
  checks: { check: string; passed: boolean }[];
  httpStatuses: { check: string; status: number }[];
  blocked?: string;
} = { completed: false, checks: [], httpStatuses: [] };
function check(label: string, passed: boolean, status?: number) {
  if (status !== undefined) report.httpStatuses.push({ check: label, status });
  report.checks.push({ check: label, passed });
  console.log(`${passed ? "PASS" : "FAIL"}: ${label}`);
  if (!passed) throw new Error(label);
}

async function main() {
  const email = z
    .email()
    .toLowerCase()
    .parse(process.env.BOOTSTRAP_ADMIN_EMAIL);
  const verifyOnly = process.argv.includes("--verify-only");
  const password = z
    .string()
    .min(14)
    .max(256)
    .parse(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  const base = new URL(process.env.APP_URL || "http://localhost:3000");
  check(
    "Verification targets localhost only",
    base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname),
  );
  check(
    "Local preview is disabled",
    fs.existsSync(".env.local") &&
      /^LOCAL_ADMIN_PREVIEW\s*=\s*false\s*$/m.test(
        fs.readFileSync(".env.local", "utf8"),
      ),
  );
  const publicPage = await fetch(new URL("/admin/login", base));
  check("Local administrator login page responds", publicPage.status === 200);
  if (!verifyOnly) {
    const name = z.string().min(2).parse(process.env.BOOTSTRAP_ADMIN_NAME);
    check(
      "First administrator does not already exist",
      (await db.adminUser.count()) === 0,
    );
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/admin.ts"],
      {
        env: {
          ...process.env,
          BOOTSTRAP_ADMIN_EMAIL: email,
          BOOTSTRAP_ADMIN_NAME: name,
          BOOTSTRAP_ADMIN_PASSWORD: password,
        },
        encoding: "utf8",
        timeout: 90000,
      },
    );
    // Child diagnostics remain in memory and are never echoed or written to disk.
    check("Existing secure bootstrap completed", child.status === 0);
  }
  const admin = await db.adminUser.findUnique({ where: { email } });
  check(
    "Active SUPER_ADMIN account exists",
    !!admin && admin.role === "SUPER_ADMIN" && admin.isActive,
  );
  check(
    "Password stored as verified Argon2id hash",
    !!admin?.passwordHash.startsWith("$argon2id$") &&
      (await verify(admin.passwordHash, password)),
  );
  check(
    "Bootstrap audit entry exists",
    !!admin &&
      (await db.auditLog.count({
        where: {
          actorAdminId: admin.id,
          action: "BOOTSTRAP",
          entityType: "AdminUser",
        },
      })) === 1,
  );

  const anonymous = await fetch(new URL("/admin", base), {
    redirect: "manual",
  });
  check(
    "Anonymous /admin redirects to login",
    anonymous.status === 307 &&
      anonymous.headers.get("location") === "/admin/login",
  );
  const anonymousApi = await fetch(new URL("/api/admin/profile", base));
  check("Anonymous administrator API is denied", anonymousApi.status === 401);
  const wrong = await fetch(new URL("/api/auth/login", base), {
    method: "POST",
    headers: { origin: base.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: randomBytes(32).toString("hex") }),
  });
  check("Incorrect password is rejected", wrong.status === 401, wrong.status);
  const login = await fetch(new URL("/api/auth/login", base), {
    method: "POST",
    headers: { origin: base.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  check(
    "Real administrator password login succeeds",
    login.status === 200,
    login.status,
  );
  const setCookie = login.headers.get("set-cookie") || "";
  check(
    "Session cookie is HttpOnly and SameSite Strict",
    /httponly/i.test(setCookie) && /samesite=strict/i.test(setCookie),
  );
  const cookie = setCookie.match(/earthlink_session=([^;]+)/)?.[0];
  check("Session cookie was issued", !!cookie);
  const headers = { cookie: cookie! };
  const profile = await fetch(new URL("/api/admin/profile", base), { headers });
  const identity = await profile.json();
  check(
    "Persisted session resolves SUPER_ADMIN role",
    profile.status === 200 && identity.role === "SUPER_ADMIN",
  );
  const token = cookie!.slice("earthlink_session=".length);
  const hash = createHmac("sha256", process.env.AUTH_SECRET!)
    .update(token)
    .digest("hex");
  const session = await db.session.findUnique({ where: { id: hash } });
  check(
    "Session is stored server-side and has a future expiry",
    !!session &&
      session.adminId === admin!.id &&
      session.expiresAt > new Date(),
  );
  for (const path of [
    "/admin",
    "/admin/employees",
    "/admin/attendance",
    "/admin/reports",
    "/admin/qr",
    "/admin/settings",
    "/admin/audit-logs",
  ]) {
    const page = await fetch(new URL(path, base), {
      headers,
      redirect: "manual",
    });
    check(`Authenticated access to ${path}`, page.status === 200);
  }
  for (const path of [
    "/api/admin/employees",
    "/api/admin/attendance",
    "/api/admin/reports",
    "/api/admin/settings",
    "/api/admin/audit-logs",
  ]) {
    const response = await fetch(new URL(path, base), { headers });
    check(
      `Authorized database-backed access to ${path}`,
      response.status === 200,
    );
  }
  const logout = await fetch(new URL("/api/auth/logout", base), {
    method: "POST",
    headers: { ...headers, origin: base.origin },
  });
  check("Logout succeeds", logout.status === 200);
  check(
    "Logout revokes only the newly created test session",
    (await db.session.findUnique({ where: { id: hash } })) === null,
  );
  const revoked = await fetch(new URL("/api/admin/profile", base), { headers });
  check(
    "Logged-out session cannot access protected API",
    revoked.status === 401,
  );
  const loggedOutPage = await fetch(new URL("/admin", base), {
    headers,
    redirect: "manual",
  });
  check(
    "Logged-out /admin redirects to login",
    loggedOutPage.status === 307 &&
      loggedOutPage.headers.get("location") === "/admin/login",
  );
  report.completed = true;
}
main()
  .catch(() => {
    report.blocked =
      "Bootstrap or verification stopped. Review the last failed check; private exception details suppressed.";
    console.error(report.blocked);
    process.exitCode = 1;
  })
  .finally(async () => {
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_NAME;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    await db.$disconnect();
    fs.mkdirSync(".local", { recursive: true });
    fs.writeFileSync(
      ".local/admin-verification.json",
      JSON.stringify(report, null, 2),
    );
    console.log(
      "Redacted result saved locally. No administrator credentials were logged or saved.",
    );
  });
