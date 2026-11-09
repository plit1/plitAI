-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('ACTIVE', 'HIDDEN');

-- CreateTable
CREATE TABLE "Pet" (
    "userId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "selectedCostumeId" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PetEvolution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "reachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetEvolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCertClaim" (
    "userId" TEXT NOT NULL,
    "certId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCertClaim_pkey" PRIMARY KEY ("userId","certId")
);

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerJobId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "workLocation" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL,
    "experience" TEXT NOT NULL,
    "education" TEXT,
    "requiredCerts" TEXT[],
    "preferredCerts" TEXT[],
    "categories" TEXT[],
    "salary" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "originalUrl" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertJobMap" (
    "certId" TEXT NOT NULL,
    "keywords" TEXT[],
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertJobMap_pkey" PRIMARY KEY ("certId")
);

-- CreateTable
CREATE TABLE "JobProfile" (
    "userId" TEXT NOT NULL,
    "regions" TEXT[],
    "roles" TEXT[],
    "experience" TEXT,
    "employment" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "SavedJob" (
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("userId","jobId")
);

-- CreateTable
CREATE TABLE "StartupProgram" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "sigungu" TEXT,
    "targetStages" TEXT[],
    "industries" TEXT[],
    "supportType" TEXT NOT NULL,
    "applyStart" TIMESTAMP(3),
    "applyEnd" TIMESTAMP(3),
    "eligibility" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "status" "ProgramStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StartupProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertIndustryMap" (
    "certId" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertIndustryMap_pkey" PRIMARY KEY ("certId")
);

-- CreateTable
CREATE TABLE "StartupProfile" (
    "userId" TEXT NOT NULL,
    "industry" TEXT,
    "sido" TEXT NOT NULL DEFAULT '',
    "sigungu" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT 'INTEREST',
    "budget" TEXT NOT NULL DEFAULT '',
    "roadmap" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StartupProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "SavedProgram" (
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedProgram_pkey" PRIMARY KEY ("userId","programId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PetEvolution_userId_level_key" ON "PetEvolution"("userId", "level");

-- CreateIndex
CREATE INDEX "JobPosting_status_region_idx" ON "JobPosting"("status", "region");

-- CreateIndex
CREATE UNIQUE INDEX "JobPosting_provider_providerJobId_key" ON "JobPosting"("provider", "providerJobId");

-- CreateIndex
CREATE UNIQUE INDEX "StartupProgram_provider_externalId_key" ON "StartupProgram"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedProgram" ADD CONSTRAINT "SavedProgram_programId_fkey" FOREIGN KEY ("programId") REFERENCES "StartupProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
