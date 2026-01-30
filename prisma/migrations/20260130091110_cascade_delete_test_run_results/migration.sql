-- DropForeignKey
ALTER TABLE "TestRunResult" DROP CONSTRAINT "TestRunResult_caseId_fkey";

-- AddForeignKey
ALTER TABLE "TestRunResult" ADD CONSTRAINT "TestRunResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
