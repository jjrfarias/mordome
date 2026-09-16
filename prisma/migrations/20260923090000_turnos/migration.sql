-- Turnos de trabalho da equipe (escala), ver ADR 0030. Não confundir com CashSession.
CREATE TABLE "WorkShift" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "daysOfWeek" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkShiftAssignment" (
    "id" TEXT NOT NULL,
    "workShiftId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkShiftAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkShift_establishmentId_name_key" ON "WorkShift"("establishmentId", "name");

CREATE INDEX "WorkShift_establishmentId_active_idx" ON "WorkShift"("establishmentId", "active");

CREATE UNIQUE INDEX "WorkShiftAssignment_workShiftId_membershipId_key" ON "WorkShiftAssignment"("workShiftId", "membershipId");

CREATE INDEX "WorkShiftAssignment_membershipId_idx" ON "WorkShiftAssignment"("membershipId");

ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkShiftAssignment" ADD CONSTRAINT "WorkShiftAssignment_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkShiftAssignment" ADD CONSTRAINT "WorkShiftAssignment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrganizationMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
