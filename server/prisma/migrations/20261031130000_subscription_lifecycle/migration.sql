-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cancelScheduledAt" TIMESTAMP(3),
ADD COLUMN     "expiryBeforeCancellation" DATE,
ADD COLUMN     "planPrice" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0;


-- Backfill: lock existing subscriptions at the plan price they would be billed today.
UPDATE "Subscription" s SET "planPrice" = p.price FROM "Plan" p WHERE p.id = s."planId" AND s."planPrice" IS NULL;

-- A locked price can never be negative.
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planPrice_nonnegative" CHECK ("planPrice" IS NULL OR "planPrice" >= 0);
