import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .max(120)
  .nullable()
  .optional()
  .transform((value) => (value === "" ? null : value));
export const departmentFields = z.object({
  name: z.string().trim().min(2).max(120),
  englishName: optionalText,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z][A-Z0-9_]{1,63}$/,
      "رمز القسم مطلوب: حروف إنجليزية وأرقام وشرطة سفلية",
    ),
});

export const CALL_CENTER = {
  name: "مركز الاتصال",
  englishName: "Call Center",
  code: "CALL_CENTER",
  isActive: true,
} as const;

export function resolveCallCenter<
  T extends { name: string; code?: string | null },
>(departments: T[]): T | undefined {
  const matches = departments.filter(
    (d) =>
      d.code === CALL_CENTER.code ||
      [CALL_CENTER.name, CALL_CENTER.englishName.toLowerCase()].includes(
        d.name.trim().toLowerCase(),
      ),
  );
  if (matches.length > 1)
    throw new Error(
      "Ambiguous Call Center departments; resolve the conflict before applying changes.",
    );
  const match = matches[0];
  if (match?.code && match.code !== CALL_CENTER.code)
    throw new Error(
      "Matching department already has another code; operator review is required.",
    );
  return match;
}
