/*
  Warnings:

  - Made the column `text` on table `Context` required. This step will fail if there are existing NULL values in that column.
  - Made the column `filePath` on table `Context` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Context" ALTER COLUMN "text" SET NOT NULL,
ALTER COLUMN "filePath" SET NOT NULL;
