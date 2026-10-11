import { afterEach, describe, it, expect, vi } from "vitest";
import { isLocalAdminPreview } from "../src/lib/preview";
afterEach(() => vi.unstubAllEnvs());
describe("local administrator UI preview", () => {
  it("requires an explicit flag in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_ADMIN_PREVIEW", "true");
    expect(isLocalAdminPreview()).toBe(true);
  });
  it("is disabled in production even with the flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_ADMIN_PREVIEW", "true");
    expect(isLocalAdminPreview()).toBe(false);
  });
  it("is disabled during tests", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LOCAL_ADMIN_PREVIEW", "true");
    expect(isLocalAdminPreview()).toBe(false);
  });
  it("does not activate automatically", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_ADMIN_PREVIEW", undefined);
    expect(isLocalAdminPreview()).toBe(false);
  });
});
