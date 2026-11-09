/*
  Warnings:

  - You are about to drop the `ChallengeOpenRequest` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "OpenRunStatus" AS ENUM ('PENDING_REVIEW', 'COLLECTING', 'THRESHOLD_REACHED', 'UNDER_REVIEW', 'OPENED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "ChallengeOpenRequest" DROP CONSTRAINT "ChallengeOpenRequest_certId_fkey";

-- DropForeignKey
ALTER TABLE "ChallengeOpenRequest" DROP CONSTRAINT "ChallengeOpenRequest_userId_fkey";

-- DropTable
DROP TABLE "ChallengeOpenRequest";

-- DropEnum
DROP TYPE "OpenRequestStatus";

-- CreateTable
CREATE TABLE "OpenRunRequest" (
    "id" TEXT NOT NULL,
    "certificationKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "round" TEXT,
    "reason" TEXT,
    "requestedById" TEXT NOT NULL,
    "status" "OpenRunStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "targetCount" INTEGER NOT NULL DEFAULT 200,
    "interestCount" INTEGER NOT NULL DEFAULT 0,
    "certId" TEXT,
    "linkedOfferingId" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenRunRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenRunInterest" (
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenRunInterest_pkey" PRIMARY KEY ("requestId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpenRunRequest_certificationKey_key" ON "OpenRunRequest"("certificationKey");

-- CreateIndex
CREATE INDEX "OpenRunRequest_status_interestCount_idx" ON "OpenRunRequest"("status", "interestCount");

-- CreateIndex
CREATE INDEX "OpenRunInterest_userId_idx" ON "OpenRunInterest"("userId");

-- AddForeignKey
ALTER TABLE "OpenRunRequest" ADD CONSTRAINT "OpenRunRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenRunInterest" ADD CONSTRAINT "OpenRunInterest_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OpenRunRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenRunInterest" ADD CONSTRAINT "OpenRunInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
