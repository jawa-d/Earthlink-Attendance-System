import { HttpError } from "./http";
import { ATTENDANCE_COOLDOWN_MS, type CooldownTimes } from "./cooldown-time";
export { ATTENDANCE_COOLDOWN_MS, type CooldownTimes } from "./cooldown-time";
export function cooldownTimes(last: Date, now: Date): CooldownTimes {
  return {
    nextAllowedAt: new Date(
      last.getTime() + ATTENDANCE_COOLDOWN_MS,
    ).toISOString(),
    serverNow: now.toISOString(),
  };
}
export class AttendanceCooldownError extends HttpError {
  constructor(
    public readonly employeeId: string,
    public readonly times: CooldownTimes,
  ) {
    super(409, "تم تسجيل حضورك مسبقاً");
  }
}
