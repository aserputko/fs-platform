-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('REQUESTOR', 'APPROVER');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('SUBMIT', 'APPROVE', 'REJECT', 'CANCEL');

-- CreateEnum
CREATE TYPE "HistoryEventType" AS ENUM ('SUBMIT', 'APPROVE', 'REJECT', 'CANCEL', 'STEP_ADVANCED');

-- CreateEnum
CREATE TYPE "ActorRole" AS ENUM ('REQUESTOR', 'APPROVER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreatedVia" AS ENUM ('USER', 'SERVICE');

-- CreateTable
CREATE TABLE "workflow_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "description" VARCHAR(1024),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step_templates" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "stepType" "StepType" NOT NULL,
    "allowedActions" JSONB NOT NULL,

    CONSTRAINT "step_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "definitionKey" VARCHAR(128) NOT NULL,
    "subject" VARCHAR(256) NOT NULL,
    "description" VARCHAR(256) NOT NULL,
    "requestorUserId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "currentStepIndex" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "sourceType" VARCHAR(64),
    "sourceId" VARCHAR(64),
    "createdVia" "CreatedVia" NOT NULL,
    "createdByService" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "stepType" "StepType" NOT NULL,
    "allowedActions" JSONB NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_tasks" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "actedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_history_entries" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "eventType" "HistoryEventType" NOT NULL,
    "actorUserId" TEXT,
    "actorRole" "ActorRole" NOT NULL,
    "comment" VARCHAR(1024),
    "fromStatus" "RequestStatus" NOT NULL,
    "toStatus" "RequestStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_history_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_definitions_key_key" ON "workflow_definitions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "step_templates_definitionId_index_key" ON "step_templates"("definitionId", "index");

-- CreateIndex
CREATE INDEX "approval_requests_requestorUserId_status_idx" ON "approval_requests"("requestorUserId", "status");

-- CreateIndex
CREATE INDEX "approval_requests_sourceType_sourceId_idx" ON "approval_requests"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "approval_requests_status_createdAt_idx" ON "approval_requests"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_requestId_index_key" ON "approval_steps"("requestId", "index");

-- CreateIndex
CREATE INDEX "approval_tasks_approverUserId_status_idx" ON "approval_tasks"("approverUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_tasks_stepId_approverUserId_key" ON "approval_tasks"("stepId", "approverUserId");

-- CreateIndex
CREATE INDEX "approval_history_entries_requestId_createdAt_idx" ON "approval_history_entries"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "step_templates" ADD CONSTRAINT "step_templates_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "approval_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_history_entries" ADD CONSTRAINT "approval_history_entries_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
