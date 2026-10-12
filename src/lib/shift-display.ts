export type ShiftChoice = {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
};
export type ShiftHistory = {
  shiftId?: string | null;
  shiftCodeSnapshot?: string | null;
  shiftNameSnapshot?: string | null;
  shiftStartTimeSnapshot?: string | null;
  shiftEndTimeSnapshot?: string | null;
  shiftBusinessDate?: Date | string | null;
};
export const NO_SHIFT = "بدون شفت";
export function time12(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "ص" : "م"}`;
}
export function shiftChoiceLabel(shift: ShiftChoice) {
  return `${shift.code} — ${shift.name} — ${time12(shift.startTime)} إلى ${time12(shift.endTime)}${shift.endTime < shift.startTime ? " (ينتهي في اليوم التالي)" : ""}`;
}
export function shiftHistoryLabel(row: ShiftHistory) {
  if (!row.shiftCodeSnapshot || !row.shiftNameSnapshot) return NO_SHIFT;
  const times =
    row.shiftStartTimeSnapshot && row.shiftEndTimeSnapshot
      ? ` — ${time12(row.shiftStartTimeSnapshot)} إلى ${time12(row.shiftEndTimeSnapshot)}`
      : "";
  return `${row.shiftCodeSnapshot} — ${row.shiftNameSnapshot}${times}`;
}
export function shiftScheduleLabel(row: ShiftHistory) {
  const day =
    row.shiftBusinessDate instanceof Date
      ? row.shiftBusinessDate.toISOString().slice(0, 10)
      : row.shiftBusinessDate?.slice(0, 10);
  return shiftHistoryLabel(row) + (day ? ` (بداية الشفت ${day})` : "");
}
