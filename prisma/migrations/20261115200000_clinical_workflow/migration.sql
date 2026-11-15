-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_doctor_id_fkey";

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "chronic_conditions" TEXT,
ADD COLUMN     "district_code" TEXT,
ADD COLUMN     "region_code" TEXT;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "is_follow_up" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'PROCEDURE',
ADD COLUMN     "reference_range" TEXT,
ADD COLUMN     "result_type" TEXT,
ADD COLUMN     "result_unit" TEXT;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "case_id" TEXT,
ADD COLUMN     "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ALTER COLUMN "doctor_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "appointment_items" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "doctor_id" TEXT,
ADD COLUMN     "performed_by" TEXT,
ADD COLUMN     "referral_id" TEXT,
ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'WAITING';

-- CreateTable
CREATE TABLE "treatment_sessions" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "planned_date" TIMESTAMP(3),
    "done_at" TIMESTAMP(3),
    "done_by" TEXT,

    CONSTRAINT "treatment_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_cases" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "case_number" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" TEXT,
    "status" TEXT NOT NULL,
    "complaint" TEXT,
    "diagnosis" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_vitals" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "case_id" TEXT,
    "height_cm" DECIMAL(6,1),
    "weight_kg" DECIMAL(6,1),
    "temperature" DECIMAL(4,1),
    "bp_systolic" INTEGER,
    "bp_diastolic" INTEGER,
    "pregnant" BOOLEAN,
    "complaints" TEXT,
    "recorded_by" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_vitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" TEXT,
    "service_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "per_day" INTEGER,
    "days" INTEGER,
    "instructions" TEXT,
    "registered_qty" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_results" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "case_id" TEXT,
    "patient_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "outcome" TEXT,
    "value" DECIMAL(18,4),
    "unit" TEXT,
    "finding" TEXT,
    "comment" TEXT,
    "sample_taken_at" TIMESTAMP(3),
    "entered_by" TEXT,
    "entered_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatment_sessions_item_id_idx" ON "treatment_sessions"("item_id");

-- CreateIndex
CREATE INDEX "clinical_cases_clinic_id_synced_at_idx" ON "clinical_cases"("clinic_id", "synced_at");

-- CreateIndex
CREATE INDEX "clinical_cases_clinic_id_patient_id_idx" ON "clinical_cases"("clinic_id", "patient_id");

-- CreateIndex
CREATE INDEX "clinical_cases_clinic_id_status_idx" ON "clinical_cases"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "patient_vitals_clinic_id_synced_at_idx" ON "patient_vitals"("clinic_id", "synced_at");

-- CreateIndex
CREATE INDEX "patient_vitals_clinic_id_patient_id_idx" ON "patient_vitals"("clinic_id", "patient_id");

-- CreateIndex
CREATE INDEX "referrals_clinic_id_synced_at_idx" ON "referrals"("clinic_id", "synced_at");

-- CreateIndex
CREATE INDEX "referrals_clinic_id_case_id_idx" ON "referrals"("clinic_id", "case_id");

-- CreateIndex
CREATE INDEX "analysis_results_clinic_id_synced_at_idx" ON "analysis_results"("clinic_id", "synced_at");

-- CreateIndex
CREATE INDEX "analysis_results_clinic_id_patient_id_idx" ON "analysis_results"("clinic_id", "patient_id");

-- CreateIndex
CREATE INDEX "analysis_results_clinic_id_case_id_idx" ON "analysis_results"("clinic_id", "case_id");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_case_id_idx" ON "appointments"("clinic_id", "case_id");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_sessions" ADD CONSTRAINT "treatment_sessions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "appointment_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_cases" ADD CONSTRAINT "clinical_cases_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_cases" ADD CONSTRAINT "clinical_cases_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_vitals" ADD CONSTRAINT "patient_vitals_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_vitals" ADD CONSTRAINT "patient_vitals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill (as the till's v2.5 rebuild): lines of visits synced before v2.5 take their visit's
-- state and doctor. Data-only, idempotent; no row is removed.
UPDATE "appointment_items" AS i
SET "status" = CASE a."status"
      WHEN 'COMPLETED' THEN 'DONE'
      WHEN 'CANCELLED' THEN 'CANCELLED'
      WHEN 'NO_SHOW' THEN 'CANCELLED'
      ELSE 'WAITING' END,
    "doctor_id" = COALESCE(i."doctor_id", a."doctor_id"),
    "completed_at" = CASE WHEN a."status" = 'COMPLETED' THEN COALESCE(i."completed_at", a."updated_at") ELSE i."completed_at" END
FROM "appointments" AS a
WHERE a."id" = i."appointment_id" AND i."status" = 'WAITING';

