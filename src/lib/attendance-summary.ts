type Event = {
  id: string;
  status: string;
  checkInAt: Date | null;
  registrationMethod: string;
};
// A daily employee summary counts a person once, while raw events remain editable.
export function summarizeAttendanceDay<T extends Event>(events: T[]) {
  const ordered = [...events].sort(
    (a, b) =>
      (a.checkInAt?.getTime() ?? Infinity) -
        (b.checkInAt?.getTime() ?? Infinity) || a.id.localeCompare(b.id),
  );
  const present = ordered.filter(
    (event) => ["PRESENT", "LATE"].includes(event.status) && event.checkInAt,
  );
  const representative =
    present.find((event) => event.status === "PRESENT") ||
    present[0] ||
    ordered.find((event) => event.status === "EXCUSED") ||
    ordered[0];
  const instants = events.flatMap((event) =>
    event.checkInAt ? [event.checkInAt.getTime()] : [],
  );
  return {
    representative,
    status: representative?.status,
    present: present.length > 0,
    firstCheckInAt: instants.length ? new Date(Math.min(...instants)) : null,
    lastCheckInAt: instants.length ? new Date(Math.max(...instants)) : null,
    eventCount: events.length,
  };
}
