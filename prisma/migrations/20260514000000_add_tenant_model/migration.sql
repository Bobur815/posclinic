-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('WEB', 'ELECTRON');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('TRIAL', 'BASIC', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('PLATFORM_ADMIN', 'SUPERADMIN', 'ADMIN', 'NURSE', 'PATIENT');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'NURSE';
COMMIT;

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_clinic_id_fkey";

-- DropIndex
DROP INDEX "users_phone_key";

-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "tenant_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "active",
DROP COLUMN "full_name",
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "first_name" TEXT NOT NULL,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "last_login_platform" "Platform",
ADD COLUMN     "last_name" TEXT NOT NULL,
ADD COLUMN     "tenant_id" TEXT NOT NULL,
ALTER COLUMN "clinic_id" DROP NOT NULL,
ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'NURSE';

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "organization_name_uz" TEXT,
    "organization_name_ru" TEXT,
    "slug" TEXT NOT NULL,
    "clinic_code" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT,
    "address" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Tashkent',
    "region" TEXT,
    "subscription_tier" "SubscriptionTier" NOT NULL DEFAULT 'TRIAL',
    "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "trial_ends_at" TIMESTAMP(3),
    "subscription_ends_at" TIMESTAMP(3),
    "max_service_points" INTEGER NOT NULL DEFAULT 2,
    "max_nurses" INTEGER NOT NULL DEFAULT 5,
    "max_monthly_visits" INTEGER NOT NULL DEFAULT 100,
    "primary_platform" "Platform" NOT NULL DEFAULT 'WEB',
    "last_accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_clinic_code_key" ON "tenants"("clinic_code");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_contact_email_key" ON "tenants"("contact_email");

-- CreateIndex
CREATE INDEX "tenants_clinic_code_idx" ON "tenants"("clinic_code");

-- CreateIndex
CREATE INDEX "tenants_contact_email_idx" ON "tenants"("contact_email");

-- CreateIndex
CREATE INDEX "tenants_subscription_status_idx" ON "tenants"("subscription_status");

-- CreateIndex
CREATE INDEX "tenants_city_idx" ON "tenants"("city");

-- CreateIndex
CREATE INDEX "clinics_tenant_id_idx" ON "clinics"("tenant_id");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- AddForeignKey
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
