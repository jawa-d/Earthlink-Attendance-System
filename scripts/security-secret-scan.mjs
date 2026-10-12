// Bounded local scan. Matches and secret values never leave this process.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { parse } from "dotenv";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const secrets = new Set();
for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  if (!fs.existsSync(file)) continue;
  const values = parse(fs.readFileSync(file));
  for (const key of ["AUTH_SECRET", "BOOTSTRAP_ADMIN_PASSWORD", "DATABASE_URL", "DIRECT_URL"]) {
    const value = values[key];
    if (!value || value.length < 12 || /replace-with|USER:PASSWORD/.test(value)) continue;
    secrets.add(value);
    if (key.endsWith("_URL")) { try { const password = decodeURIComponent(new URL(value).password); if (password.length >= 12) secrets.add(password); } catch { /* no diagnostic values */ } }
  }
}
const knownMatches = text => [...secrets].some(secret => text.includes(secret));
const suspicious = text => /gh[pousr]_[a-zA-Z0-9]{36,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text) ||
  [...text.matchAll(/postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@[^\s"']+/g)].some(([value]) => !/USER:PASSWORD|synthetic|REPLACE_WITH/.test(value));
const files = [...new Set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean))];
const findings = [];
for (const file of files) {
  if (!fs.existsSync(file) || fs.statSync(file).size > 2 * 1024 * 1024) continue;
  const text = fs.readFileSync(file, "utf8");
  if (knownMatches(text)) findings.push({ file, kind: "saved-secret-exact-match" });
  // Synthetic security fixtures and this scanner intentionally contain patterns.
  if (!file.startsWith("tests/") && file !== "scripts/security-secret-scan.mjs" && suspicious(text)) findings.push({ file, kind: "credential-pattern-review" });
}
let historical = "NOT TESTED";
try { historical = knownMatches(git("log", "--all", "--format=", "-p", "--", ".", ":(exclude)public/fonts/*")) ? "MATCH REQUIRES PRIVATE REVIEW" : "no exact matches to currently saved secrets"; }
catch { historical = "NOT TESTED: history scan exceeded limit or git unavailable"; }
console.log(JSON.stringify({ nonignoredFiles: files.length, savedSecretsChecked: secrets.size, findings, historical, scope: "Tracked and new nonignored files: known saved secrets and limited patterns; not a complete historical secret detector." }, null, 2));
if (findings.length || historical === "MATCH REQUIRES PRIVATE REVIEW") process.exitCode = 1;
