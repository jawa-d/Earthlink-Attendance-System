-- Soft-deleted records do not reserve the employee's daily active slot.
CREATE UNIQUE INDEX "AttendanceRecord_active_employee_date"
ON "AttendanceRecord" ("employeeId", "attendanceDate")
WHERE "deletedAt" IS NULL;

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_corporate_email_check"
CHECK ("normalizedEmail" = lower(trim("normalizedEmail")) AND "normalizedEmail" ~ '^[^@[:space:]]+@earthlink[.]iq$');
