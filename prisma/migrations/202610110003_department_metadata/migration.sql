-- Add optional metadata without rewriting existing departments or employee links.
ALTER TABLE "Department" ADD COLUMN "englishName" TEXT;
ALTER TABLE "Department" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");
