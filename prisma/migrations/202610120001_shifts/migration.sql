-- ADDITIVE ONLY; review and approve before any production execution.
-- No historical rows are updated, backfilled or deleted. Enforcement is an
-- application rollout gate, never a NOT NULL constraint on legacy attendance.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE "Shift" (
  "id" UUID NOT NULL, "code" VARCHAR(20) NOT NULL, "name" VARCHAR(120) NOT NULL,
  "startTime" VARCHAR(5) NOT NULL, "endTime" VARCHAR(5) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Shift_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Shift_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  CONSTRAINT "Shift_startTime_check" CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "Shift_endTime_check" CHECK ("endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "Shift_duration_check" CHECK ("startTime" <> "endTime")
);
CREATE UNIQUE INDEX "Shift_code_key" ON "Shift"("code");
CREATE INDEX "Shift_isActive_code_idx" ON "Shift"("isActive", "code");
CREATE TABLE "ShiftDepartment" (
  "shiftId" UUID NOT NULL, "departmentId" UUID NOT NULL,
  CONSTRAINT "ShiftDepartment_pkey" PRIMARY KEY ("shiftId", "departmentId"),
  CONSTRAINT "ShiftDepartment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ShiftDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ShiftDepartment_departmentId_shiftId_idx" ON "ShiftDepartment"("departmentId", "shiftId");
ALTER TABLE "AttendanceRecord"
  ADD COLUMN "shiftId" UUID,
  ADD COLUMN "shiftCodeSnapshot" VARCHAR(20),
  ADD COLUMN "shiftNameSnapshot" VARCHAR(120),
  ADD COLUMN "shiftStartTimeSnapshot" VARCHAR(5),
  ADD COLUMN "shiftEndTimeSnapshot" VARCHAR(5),
  ADD COLUMN "shiftBusinessDate" DATE,
  ADD COLUMN "shiftStartsAt" TIMESTAMP(3),
  ADD COLUMN "shiftEndsAt" TIMESTAMP(3);
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_shift_snapshot_check" CHECK (
  ("shiftId" IS NULL AND "shiftCodeSnapshot" IS NULL AND "shiftNameSnapshot" IS NULL AND
    "shiftStartTimeSnapshot" IS NULL AND "shiftEndTimeSnapshot" IS NULL AND
    "shiftBusinessDate" IS NULL AND "shiftStartsAt" IS NULL AND "shiftEndsAt" IS NULL)
  OR ("shiftId" IS NOT NULL AND "shiftCodeSnapshot" IS NOT NULL AND "shiftNameSnapshot" IS NOT NULL AND
    "shiftStartTimeSnapshot" IS NOT NULL AND "shiftEndTimeSnapshot" IS NOT NULL AND
    "shiftBusinessDate" IS NOT NULL AND "shiftStartsAt" IS NOT NULL AND "shiftEndsAt" IS NOT NULL AND "shiftEndsAt" > "shiftStartsAt")
) NOT VALID;
CREATE INDEX "AttendanceRecord_shiftId_attendanceDate_idx" ON "AttendanceRecord"("shiftId", "attendanceDate");
COMMIT;
