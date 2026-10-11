-- Additive migration. No existing employee, attendance or administrator is overwritten.
BEGIN;
CREATE TABLE "TeamLeader" (
 "id" UUID NOT NULL, "fullName" TEXT NOT NULL, "employeeNumber" TEXT,
 "departmentId" UUID NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
 "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TeamLeader_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Employee" ADD COLUMN "teamLeaderId" UUID;
CREATE TABLE "EmployeeAssignment" (
 "id" UUID NOT NULL, "employeeId" UUID NOT NULL, "teamLeaderId" UUID,
 "departmentId" UUID NOT NULL, "leaderName" TEXT, "departmentName" TEXT NOT NULL,
 "status" "EmploymentStatus" NOT NULL, "effectiveFrom" DATE NOT NULL, "effectiveTo" DATE,
 CONSTRAINT "EmployeeAssignment_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "EmployeeAssignment_valid_interval" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);
CREATE INDEX "TeamLeader_departmentId_isActive_idx" ON "TeamLeader"("departmentId", "isActive");
CREATE INDEX "Employee_teamLeaderId_status_deletedAt_idx" ON "Employee"("teamLeaderId", "status", "deletedAt");
CREATE UNIQUE INDEX "EmployeeAssignment_employeeId_effectiveFrom_key" ON "EmployeeAssignment"("employeeId", "effectiveFrom");
CREATE UNIQUE INDEX "EmployeeAssignment_one_open_interval" ON "EmployeeAssignment"("employeeId") WHERE "effectiveTo" IS NULL;
CREATE INDEX "EmployeeAssignment_teamLeaderId_effectiveFrom_effectiveTo_idx" ON "EmployeeAssignment"("teamLeaderId", "effectiveFrom", "effectiveTo");
CREATE INDEX "EmployeeAssignment_departmentId_effectiveFrom_effectiveTo_idx" ON "EmployeeAssignment"("departmentId", "effectiveFrom", "effectiveTo");
ALTER TABLE "TeamLeader" ADD CONSTRAINT "TeamLeader_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_teamLeaderId_fkey" FOREIGN KEY ("teamLeaderId") REFERENCES "TeamLeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_teamLeaderId_fkey" FOREIGN KEY ("teamLeaderId") REFERENCES "TeamLeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Establish only a known current-state baseline. Do not invent earlier employment periods.
INSERT INTO "EmployeeAssignment" ("id", "employeeId", "teamLeaderId", "departmentId", "leaderName", "departmentName", "status", "effectiveFrom")
SELECT gen_random_uuid(), e."id", NULL, e."departmentId", NULL, d."name",
 CASE WHEN e."deletedAt" IS NOT NULL THEN 'INACTIVE'::"EmploymentStatus" ELSE e."status" END,
 GREATEST((e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Baghdad')::date, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Baghdad')::date)
FROM "Employee" e JOIN "Department" d ON d."id" = e."departmentId";
COMMIT;
