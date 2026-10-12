// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { RecordsTable } from "../src/components/records-table";
afterEach(cleanup);
describe("stored employee and audit text rendering", () => {
  it("renders attack-like employee names as text instead of executable markup", () => {
    const payload = '<img src=x onerror="window.compromised=true"><script>alert(1)</script>';
    const { container } = render(<RecordsTable kind="employees" rows={[{ id: "synthetic", fullName: payload, employeeNumber: "1", normalizedEmail: "synthetic@earthlink.iq", department: { name: payload } }]} />);
    expect(container.textContent).toContain(payload); expect(container.querySelector("script,img")).toBeNull();
  });
  it("escapes audit reasons and actor names", () => {
    const payload = '<svg onload="alert(1)">';
    const { container } = render(<RecordsTable kind="audit-logs" rows={[{ id: "synthetic", actorAdmin: { name: payload }, reason: payload, action: "CREATE" }]} />);
    expect(container.textContent).toContain(payload); expect(container.querySelector("svg")).toBeNull();
  });
});
