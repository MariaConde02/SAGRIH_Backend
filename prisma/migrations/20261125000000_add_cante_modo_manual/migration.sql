-- AlterTable
ALTER TABLE "tm_cante" ADD COLUMN IF NOT EXISTS "cante_modo_manual" BOOLEAN DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_cante_inver_mm" ON "tm_cante"("inver_id", "cante_modo_manual");
