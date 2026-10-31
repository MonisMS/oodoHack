-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('SERVICE', 'DIGITAL', 'PHYSICAL');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceLineKind" AS ENUM ('CHARGE', 'DISCOUNT');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "DiscountScope" AS ENUM ('PRODUCT', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CARD');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" "ProductType" NOT NULL DEFAULT 'SERVICE',
    "salesPrice" DECIMAL(14,2) NOT NULL,
    "costPrice" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "attribute" VARCHAR(80) NOT NULL,
    "value" VARCHAR(80) NOT NULL,
    "extraPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "billingPeriod" "BillingPeriod" NOT NULL,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "availableFrom" DATE,
    "availableTo" DATE,
    "autoClose" BOOLEAN NOT NULL DEFAULT true,
    "closableEarly" BOOLEAN NOT NULL DEFAULT false,
    "pausable" BOOLEAN NOT NULL DEFAULT false,
    "renewable" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tax" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "percentage" DECIMAL(7,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discount" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "DiscountType" NOT NULL,
    "scope" "DiscountScope" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "minPurchase" DECIMAL(14,2),
    "minQuantity" INTEGER,
    "startsAt" DATE NOT NULL,
    "endsAt" DATE,
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountUsage" (
    "id" UUID NOT NULL,
    "discountId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationTemplate" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "planId" UUID NOT NULL,
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationTemplateLine" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuotationTemplateLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "templateId" UUID,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" DATE NOT NULL,
    "expiryDate" DATE,
    "nextInvoiceDate" DATE NOT NULL,
    "billingAnchorDay" INTEGER NOT NULL,
    "billingAnchorMonth" INTEGER NOT NULL,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionLine" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SubscriptionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "fromStatus" "SubscriptionStatus" NOT NULL,
    "toStatus" "SubscriptionStatus" NOT NULL,
    "actorId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "kind" "InvoiceLineKind" NOT NULL DEFAULT 'CHARGE',
    "productId" UUID,
    "variantId" UUID,
    "discountId" UUID,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "taxes" JSONB NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "recordedById" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("prefix","year")
);

-- CreateTable
CREATE TABLE "_ProductTaxes" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ProductTaxes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_PlanTaxes" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_PlanTaxes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_DiscountProducts" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_DiscountProducts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Product_isActive_name_idx" ON "Product"("isActive", "name");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_isActive_idx" ON "ProductVariant"("productId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_attribute_value_key" ON "ProductVariant"("productId", "attribute", "value");

-- CreateIndex
CREATE INDEX "Plan_isActive_availableFrom_availableTo_idx" ON "Plan"("isActive", "availableFrom", "availableTo");

-- CreateIndex
CREATE UNIQUE INDEX "Tax_name_key" ON "Tax"("name");

-- CreateIndex
CREATE INDEX "Discount_isActive_startsAt_endsAt_idx" ON "Discount"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "DiscountUsage_invoiceId_idx" ON "DiscountUsage"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountUsage_discountId_invoiceId_key" ON "DiscountUsage"("discountId", "invoiceId");

-- CreateIndex
CREATE INDEX "QuotationTemplate_planId_isActive_idx" ON "QuotationTemplate"("planId", "isActive");

-- CreateIndex
CREATE INDEX "QuotationTemplateLine_productId_idx" ON "QuotationTemplateLine"("productId");

-- CreateIndex
CREATE INDEX "QuotationTemplateLine_variantId_idx" ON "QuotationTemplateLine"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationTemplateLine_templateId_position_key" ON "QuotationTemplateLine"("templateId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_number_key" ON "Subscription"("number");

-- CreateIndex
CREATE INDEX "Subscription_status_nextInvoiceDate_idx" ON "Subscription"("status", "nextInvoiceDate");

-- CreateIndex
CREATE INDEX "Subscription_customerId_status_idx" ON "Subscription"("customerId", "status");

-- CreateIndex
CREATE INDEX "Subscription_planId_status_idx" ON "Subscription"("planId", "status");

-- CreateIndex
CREATE INDEX "Subscription_nextInvoiceDate_idx" ON "Subscription"("nextInvoiceDate");

-- CreateIndex
CREATE INDEX "Subscription_expiryDate_idx" ON "Subscription"("expiryDate");

-- CreateIndex
CREATE INDEX "SubscriptionLine_productId_idx" ON "SubscriptionLine"("productId");

-- CreateIndex
CREATE INDEX "SubscriptionLine_variantId_idx" ON "SubscriptionLine"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionLine_subscriptionId_position_key" ON "SubscriptionLine"("subscriptionId", "position");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_actorId_idx" ON "SubscriptionEvent"("actorId");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_subscriptionId_createdAt_idx" ON "SubscriptionEvent"("subscriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_customerId_status_idx" ON "Invoice"("customerId", "status");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE INDEX "Invoice_issueDate_idx" ON "Invoice"("issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_subscriptionId_periodStart_key" ON "Invoice"("subscriptionId", "periodStart");

-- CreateIndex
CREATE INDEX "InvoiceLine_productId_idx" ON "InvoiceLine"("productId");

-- CreateIndex
CREATE INDEX "InvoiceLine_variantId_idx" ON "InvoiceLine"("variantId");

-- CreateIndex
CREATE INDEX "InvoiceLine_discountId_idx" ON "InvoiceLine"("discountId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_position_key" ON "InvoiceLine"("invoiceId", "position");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_date_method_idx" ON "Payment"("date", "method");

-- CreateIndex
CREATE INDEX "_ProductTaxes_B_index" ON "_ProductTaxes"("B");

-- CreateIndex
CREATE INDEX "_PlanTaxes_B_index" ON "_PlanTaxes"("B");

-- CreateIndex
CREATE INDEX "_DiscountProducts_B_index" ON "_DiscountProducts"("B");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountUsage" ADD CONSTRAINT "DiscountUsage_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountUsage" ADD CONSTRAINT "DiscountUsage_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationTemplate" ADD CONSTRAINT "QuotationTemplate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationTemplateLine" ADD CONSTRAINT "QuotationTemplateLine_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "QuotationTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationTemplateLine" ADD CONSTRAINT "QuotationTemplateLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationTemplateLine" ADD CONSTRAINT "QuotationTemplateLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "QuotationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionLine" ADD CONSTRAINT "SubscriptionLine_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionLine" ADD CONSTRAINT "SubscriptionLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionLine" ADD CONSTRAINT "SubscriptionLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductTaxes" ADD CONSTRAINT "_ProductTaxes_A_fkey" FOREIGN KEY ("A") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductTaxes" ADD CONSTRAINT "_ProductTaxes_B_fkey" FOREIGN KEY ("B") REFERENCES "Tax"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanTaxes" ADD CONSTRAINT "_PlanTaxes_A_fkey" FOREIGN KEY ("A") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanTaxes" ADD CONSTRAINT "_PlanTaxes_B_fkey" FOREIGN KEY ("B") REFERENCES "Tax"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DiscountProducts" ADD CONSTRAINT "_DiscountProducts_A_fkey" FOREIGN KEY ("A") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DiscountProducts" ADD CONSTRAINT "_DiscountProducts_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Domain guards complement request validation for direct database writes.
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized" CHECK (email = lower(btrim(email)));
ALTER TABLE "Product" ADD CONSTRAINT "Product_prices_nonnegative" CHECK ("salesPrice" >= 0 AND "costPrice" >= 0);
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_extra_nonnegative" CHECK ("extraPrice" >= 0);
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_values_valid" CHECK (price >= 0 AND "minQuantity" >= 1 AND ("availableFrom" IS NULL OR "availableTo" IS NULL OR "availableFrom" < "availableTo"));
ALTER TABLE "Tax" ADD CONSTRAINT "Tax_percentage_range" CHECK (percentage >= 0 AND percentage <= 100);
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_values_valid" CHECK (value > 0 AND (type <> 'PERCENTAGE' OR value <= 100) AND ("minPurchase" IS NULL OR "minPurchase" >= 0) AND ("minQuantity" IS NULL OR "minQuantity" >= 1) AND ("endsAt" IS NULL OR "endsAt" >= "startsAt") AND "usedCount" >= 0 AND ("usageLimit" IS NULL OR ("usageLimit" > 0 AND "usedCount" <= "usageLimit")));
ALTER TABLE "DiscountUsage" ADD CONSTRAINT "DiscountUsage_amount_positive" CHECK (amount > 0);
ALTER TABLE "QuotationTemplate" ADD CONSTRAINT "QuotationTemplate_validity_positive" CHECK ("validityDays" > 0);
ALTER TABLE "QuotationTemplateLine" ADD CONSTRAINT "QuotationTemplateLine_values_valid" CHECK (quantity > 0 AND ("unitPrice" IS NULL OR "unitPrice" >= 0) AND position >= 0);
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_values_valid" CHECK ("paymentTermsDays" >= 0 AND "billingAnchorDay" BETWEEN 1 AND 31 AND "billingAnchorMonth" BETWEEN 1 AND 12 AND ("expiryDate" IS NULL OR "expiryDate" >= "startDate") AND "nextInvoiceDate" >= "startDate");
ALTER TABLE "SubscriptionLine" ADD CONSTRAINT "SubscriptionLine_values_valid" CHECK (quantity > 0 AND "unitPrice" >= 0 AND position >= 0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_values_valid" CHECK ("periodEnd" > "periodStart" AND "dueDate" >= "issueDate" AND subtotal >= 0 AND "discountTotal" >= 0 AND "discountTotal" <= subtotal AND "taxTotal" >= 0 AND total = subtotal + "taxTotal" - "discountTotal" AND "amountPaid" >= 0 AND "amountPaid" <= total AND currency = 'INR');
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_values_valid" CHECK (quantity > 0 AND position >= 0 AND subtotal = quantity * "unitPrice" AND total = subtotal + "taxTotal" AND jsonb_typeof(taxes) = 'array' AND ((kind = 'CHARGE' AND "unitPrice" >= 0 AND "taxTotal" >= 0 AND "discountId" IS NULL) OR (kind = 'DISCOUNT' AND quantity = 1 AND "unitPrice" < 0 AND "taxTotal" = 0 AND "discountId" IS NOT NULL)));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK (amount > 0);
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_values_valid" CHECK (value >= 0 AND year BETWEEN 1 AND 9999);
