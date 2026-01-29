/*
  Warnings:

  - You are about to drop the column `question` on the `TestCase` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TestCase" DROP COLUMN "question",
ADD COLUMN     "questionAudioPath" TEXT,
ADD COLUMN     "questionImagePath" TEXT,
ADD COLUMN     "questionText" TEXT;
