/*
  Warnings:

  - Added the required column `name` to the `Context` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Context" ADD COLUMN     "name" TEXT NOT NULL;
