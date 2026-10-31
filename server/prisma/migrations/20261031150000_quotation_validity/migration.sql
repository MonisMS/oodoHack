-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "quotationValidUntil" DATE,
ADD COLUMN     "quotationValidityDays" INTEGER;


-- A quotation validity is a positive number of days.
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_quotationValidityDays_positive" CHECK ("quotationValidityDays" IS NULL OR "quotationValidityDays" > 0);
