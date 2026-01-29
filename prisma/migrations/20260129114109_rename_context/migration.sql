/*
  Warnings:

  - You are about to drop the `TestContext` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_TestContextToTestSuite` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_TestContextToTestSuite" DROP CONSTRAINT "_TestContextToTestSuite_A_fkey";

-- DropForeignKey
ALTER TABLE "_TestContextToTestSuite" DROP CONSTRAINT "_TestContextToTestSuite_B_fkey";

-- DropTable
DROP TABLE "TestContext";

-- DropTable
DROP TABLE "_TestContextToTestSuite";

-- CreateTable
CREATE TABLE "Context" (
    "id" TEXT NOT NULL,
    "text" TEXT,
    "filePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Context_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ContextToTestSuite" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ContextToTestSuite_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ContextToTestSuite_B_index" ON "_ContextToTestSuite"("B");

-- AddForeignKey
ALTER TABLE "_ContextToTestSuite" ADD CONSTRAINT "_ContextToTestSuite_A_fkey" FOREIGN KEY ("A") REFERENCES "Context"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContextToTestSuite" ADD CONSTRAINT "_ContextToTestSuite_B_fkey" FOREIGN KEY ("B") REFERENCES "TestSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
