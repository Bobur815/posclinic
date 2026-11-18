-- v2.10: stock, expenses and payments synced from the main till (additive: new tables only).
-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "barcode" TEXT,
    "min_qty" DECIMAL(14,3),
    "qty_on_hand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "avg_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "service_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_receipts" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplier" TEXT,
    "doc_no" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "paid_from" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "receipt_id" TEXT,
    "item_id" TEXT,
    "session_id" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "spent_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "paid_from" TEXT NOT NULL,
    "created_by_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_clinic_id_synced_at_idx" ON "products"("clinic_id", "synced_at");

-- CreateIndex
CREATE INDEX "products_clinic_id_category_idx" ON "products"("clinic_id", "category");

-- CreateIndex
CREATE INDEX "stock_receipts_clinic_id_synced_at_idx" ON "stock_receipts"("clinic_id", "synced_at");

-- CreateIndex
CREATE INDEX "stock_receipts_clinic_id_received_at_idx" ON "stock_receipts"("clinic_id", "received_at");

-- CreateIndex
CREATE INDEX "stock_movements_clinic_id_synced_at_idx" ON "stock_movements"("clinic_id", "synced_at");

-- CreateIndex
CREATE INDEX "stock_movements_clinic_id_created_at_idx" ON "stock_movements"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "expenses_clinic_id_synced_at_idx" ON "expenses"("clinic_id", "synced_at");

-- CreateIndex
CREATE INDEX "expenses_clinic_id_spent_at_idx" ON "expenses"("clinic_id", "spent_at");

-- CreateIndex
CREATE INDEX "payments_clinic_id_synced_at_idx" ON "payments"("clinic_id", "synced_at");

-- CreateIndex
CREATE INDEX "payments_clinic_id_created_at_idx" ON "payments"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_appointment_id_idx" ON "payments"("appointment_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

