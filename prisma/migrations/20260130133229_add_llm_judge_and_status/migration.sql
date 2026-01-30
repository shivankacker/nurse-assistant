-- AlterTable
ALTER TABLE "TestRun" ADD COLUMN     "llmJudgeModel" TEXT,
ADD COLUMN     "llmJudgePrompt" TEXT,
ADD COLUMN     "status" "TEST_RUN_STATUS" NOT NULL DEFAULT 'PENDING';
