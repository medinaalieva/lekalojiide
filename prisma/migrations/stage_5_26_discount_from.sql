-- Stage 5.26: Add discount_from column to products table for scheduled marketing discounts
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "discount_from" TIMESTAMPTZ;
