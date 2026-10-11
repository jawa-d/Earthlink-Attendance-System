import assert from "node:assert/strict";
const base = process.env.APP_URL || "http://localhost:3000";
for (const route of ["/attendance", "/attendance/success", "/admin/login"]) {
  const response = await fetch(base + route);
  assert.equal(response.status, 200, route);
  console.log(`${route}: 200`);
}
const admin = await fetch(base + "/admin", { redirect: "manual" });
assert.equal(admin.status, 307);
assert.equal(admin.headers.get("location"), "/admin/login");
console.log("/admin: redirects to login");
for (const route of [
  "/api/admin/employees",
  "/api/admin/attendance",
  "/api/admin/dashboard",
  "/api/admin/settings",
  "/api/admin/audit-logs",
  "/api/admin/export",
  "/api/admin/qr",
]) {
  const response = await fetch(base + route);
  assert.equal(response.status, 401, route);
  console.log(`${route}: 401`);
}
const invalid = await fetch(base + "/api/attendance", {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "test@earthlink.iq.evil.com",
    checkInAt: "2000-01-01",
  }),
});
assert.equal(invalid.status, 400);
console.log("Deceptive public email: 400");
const csrf = await fetch(base + "/api/attendance", {
  method: "POST",
  headers: {
    Origin: "https://evil.example",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email: "test@earthlink.iq" }),
});
assert.equal(csrf.status, 403);
console.log("Cross-origin public submission: 403");
