import { describe, expect, it } from "vitest";
import { departmentFields, resolveCallCenter } from "../src/lib/departments";
describe("department metadata and safe Call Center reuse", () => {
  it("preserves compatibility with existing name-only requests", () => {
    expect(departmentFields.parse({ name: "مركز الاتصال" })).toEqual({
      name: "مركز الاتصال",
    });
  });
  it("normalizes codes and permits clearing optional metadata", () => {
    expect(
      departmentFields.parse({
        name: "مركز الاتصال",
        code: " call_center ",
        englishName: "",
      }),
    ).toEqual({ name: "مركز الاتصال", code: "CALL_CENTER", englishName: null });
    expect(() =>
      departmentFields.parse({ name: "مركز الاتصال", code: "CALL CENTER" }),
    ).toThrow();
  });
  it("reuses Arabic, English and coded departments without replacing their ID", () => {
    for (const entry of [
      { id: "existing", name: "مركز الاتصال" },
      { id: "existing", name: " Call Center " },
      { id: "existing", name: "Other", code: "CALL_CENTER" },
    ]) {
      expect(resolveCallCenter([entry])).toBe(entry);
    }
    expect(resolveCallCenter([{ name: "Other" }])).toBeUndefined();
  });
  it("refuses ambiguous records and conflicting codes instead of merging or deleting", () => {
    expect(() =>
      resolveCallCenter([{ name: "Call Center" }, { name: "مركز الاتصال" }]),
    ).toThrow();
    expect(() =>
      resolveCallCenter([{ name: "Call Center", code: "OTHER" }]),
    ).toThrow();
  });
});
