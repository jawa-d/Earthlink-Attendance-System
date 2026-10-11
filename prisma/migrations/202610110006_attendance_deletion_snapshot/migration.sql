-- Additive only. Does not alter or delete any attendance records.
CREATE TABLE "AttendanceDeletionSnapshot" (
    "id" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "sessionId" TEXT NOT NULL,
    "selection" JSONB NOT NULL,
    "records" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "exportedAt" TIMESTAMP(3),
    "fileHash" TEXT,
    "reauthenticatedAt" TIMESTAMP(3),
    "codeVerifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    CONSTRAINT "AttendanceDeletionSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AttendanceDeletionSnapshot_count_check" CHECK ("recordCount" > 0)
);
CREATE INDEX "AttendanceDeletionSnapshot_adminId_expiresAt_idx"
    ON "AttendanceDeletionSnapshot"("adminId", "expiresAt");
ALTER TABLE "AttendanceDeletionSnapshot" ADD CONSTRAINT "AttendanceDeletionSnapshot_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
