// Tests a built production server on loopback with unusable synthetic DB URLs.
// No valid login/check-in or database access is attempted.
import { spawn } from "node:child_process";
import fs from "node:fs";
const base = "http://127.0.0.1:3117";
const origin = "https://synthetic.invalid";
process.env.ATTENDANCE_SHIFTS_ENABLED = "false";
const environment = { ...process.env, NODE_ENV: "production", DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/security_smoke?sslmode=require", DIRECT_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/security_smoke?sslmode=require", AUTH_SECRET: "synthetic-smoke-only-secret-0123456789-0123456789", APP_URL: origin, QR_BASE_URL: origin, TEST_DATABASE_URL: "", BOOTSTRAP_ADMIN_EMAIL: "", BOOTSTRAP_ADMIN_NAME: "", BOOTSTRAP_ADMIN_PASSWORD: "", LOCAL_ADMIN_PREVIEW: "false" };
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3117"], { env: environment, stdio: "ignore", windowsHide: true });
const results = [];
function check(name, passed, status) { results.push({ name, passed, ...(status ? { status } : {}) }); console.log(`${passed ? "PASS" : "FAIL"}: ${name}`); if (!passed) throw new Error("Local security check failed"); }
try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try { ready = (await fetch(`${base}/attendance`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* startup only */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  check("isolated loopback production server responds", ready);
  const page = await fetch(`${base}/attendance`, { method: "HEAD" });
  check("production security headers are served", page.headers.get("content-security-policy")?.includes("object-src 'none'") && page.headers.get("x-frame-options") === "DENY" && page.headers.get("x-content-type-options") === "nosniff" && !!page.headers.get("strict-transport-security"));
  check("framework powered-by header removed", !page.headers.has("x-powered-by"));
  const admin = await fetch(`${base}/admin`, { redirect: "manual" });
  check("anonymous admin page redirects to login", admin.status === 307 && admin.headers.get("location") === "/admin/login", admin.status);
  for (const path of ["/api/admin/employees", "/api/admin/admins", "/api/admin/audit-logs", "/api/admin/export", "/api/admin/team-leaders", "/api/admin/qr", "/api/admin/shifts"]) {
    const response = await fetch(base + path);
    check(`anonymous ${path} denied and noncacheable`, response.status === 401 && response.headers.get("cache-control") === "private, no-store", response.status);
  }
  const post = (path, body, headers = {}) => fetch(base + path, { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body });
  const shiftConfig = await fetch(`${base}/api/attendance/shifts`);
  check("public shift rollout config is disabled and noncacheable", shiftConfig.status === 200 && (await shiftConfig.json()).enabled === false && shiftConfig.headers.get("cache-control") === "private, no-store");
  const shiftWrite = await post("/api/admin/shifts", "{}"); check("anonymous shift creation denied", shiftWrite.status === 401, shiftWrite.status);
  const publicOptions = await post("/api/attendance/shifts", "{}"); check("disabled shift catalog makes no employee lookup", publicOptions.status === 200 && (await publicOptions.json()).enabled === false, publicOptions.status);
  const publicMarkup = await (await fetch(`${base}/attendance`)).text(); check("public page contains labelled shift selector", publicMarkup.includes('id="shift"') && publicMarkup.includes('for="shift"'));
  const csrf = await post("/api/attendance", "{}", { origin: "https://attacker.invalid" });
  check("cross-origin attendance rejected without DB access", csrf.status === 403, csrf.status);
  const primitive = await post("/api/attendance", "null"); check("primitive JSON returns 400", primitive.status === 400, primitive.status);
  const oversize = await post("/api/attendance", JSON.stringify({ email: "synthetic@earthlink.iq", extra: "x".repeat(65536) })); check("oversize actual JSON returns 413", oversize.status === 413, oversize.status);
  const cooldown = await post("/api/attendance/cooldown", "{}"); check("empty receipt enables email entry without DB access", cooldown.status === 200 && (await cooldown.json()).state === "unknown", cooldown.status);
} catch {
  console.error("Isolated local smoke stopped; private diagnostics suppressed."); process.exitCode = 1;
} finally {
  server.kill();
  fs.mkdirSync(".local/security", { recursive: true });
  fs.writeFileSync(".local/security/local-smoke.json", JSON.stringify({ environment: "loopback/synthetic/unusable DB", results }, null, 2));
}
