-- CreateEnum
CREATE TYPE "OpenRequestStatus" AS ENUM ('PENDING', 'PLANNED', 'OPENED', 'DECLINED');

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "mfa" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaEnabledAt" TIMESTAMP(3),
ADD COLUMN     "mfaLastStep" INTEGER;

-- CreateTable
CREATE TABLE "ChallengeOpenRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "certId" TEXT NOT NULL,
    "message" TEXT,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "status" "OpenRequestStatus" NOT NULL DEFAULT 'PENDING',
    "offeringId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeOpenRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChallengeOpenRequest_certId_status_idx" ON "ChallengeOpenRequest"("certId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeOpenRequest_userId_certId_key" ON "ChallengeOpenRequest"("userId", "certId");

-- AddForeignKey
ALTER TABLE "ChallengeOpenRequest" ADD CONSTRAINT "ChallengeOpenRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeOpenRequest" ADD CONSTRAINT "ChallengeOpenRequest_certId_fkey" FOREIGN KEY ("certId") REFERENCES "Certification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
