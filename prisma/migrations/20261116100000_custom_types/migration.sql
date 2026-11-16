-- AlterTable
ALTER TABLE "users" ADD COLUMN     "staff_type_id" TEXT;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "service_type_id" TEXT;

-- CreateTable
CREATE TABLE "service_types" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "name_uz" TEXT NOT NULL,
    "name_ru" TEXT,
    "behavior" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_types" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "name_uz" TEXT NOT NULL,
    "name_ru" TEXT,
    "access" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_types_clinic_id_synced_at_idx" ON "service_types"("clinic_id", "synced_at");

-- CreateIndex
CREATE INDEX "staff_types_clinic_id_synced_at_idx" ON "staff_types"("clinic_id", "synced_at");

-- AddForeignKey
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_types" ADD CONSTRAINT "staff_types_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

