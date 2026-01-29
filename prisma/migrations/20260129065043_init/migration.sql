-- CreateEnum
CREATE TYPE "TEST_RUN_STATUS" AS ENUM ('PENDING', 'RUNNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "TestSuite" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestSuite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "expectedAnswer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "testSuiteId" TEXT NOT NULL,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestContext" (
    "id" TEXT NOT NULL,
    "text" TEXT,
    "filePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "llmModel" TEXT NOT NULL,
    "topP" DOUBLE PRECISION NOT NULL,
    "topK" INTEGER NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" "TEST_RUN_STATUS" NOT NULL DEFAULT 'PENDING',
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestRunResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "bleuScore" DOUBLE PRECISION NOT NULL,
    "cosineSimScore" DOUBLE PRECISION NOT NULL,
    "llmScore" DOUBLE PRECISION NOT NULL,
    "llmScoreReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestRunResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TestContextToTestSuite" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TestContextToTestSuite_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_TestContextToTestSuite_B_index" ON "_TestContextToTestSuite"("B");

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_testSuiteId_fkey" FOREIGN KEY ("testSuiteId") REFERENCES "TestSuite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "TestSuite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRunResult" ADD CONSTRAINT "TestRunResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TestRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRunResult" ADD CONSTRAINT "TestRunResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TestCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TestContextToTestSuite" ADD CONSTRAINT "_TestContextToTestSuite_A_fkey" FOREIGN KEY ("A") REFERENCES "TestContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TestContextToTestSuite" ADD CONSTRAINT "_TestContextToTestSuite_B_fkey" FOREIGN KEY ("B") REFERENCES "TestSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
