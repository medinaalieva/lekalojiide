-- ============================================================================
-- LEKALO ZHIIDE — STAGE 5.24: HEIGHTS & FORMATS DICTIONARIES ENHANCEMENT
-- Target Database: lekalo_test (PostgreSQL 18+ / Neon)
-- Safety: READ/ALTER ONLY ON lekalo_test. Production Neon/Supabase untouched.
-- Adds: min_height, max_height, max_print_width, is_active, created_at, updated_at
-- ============================================================================

DO $$
BEGIN
    -- Verify safety: only lekalo_test allowed
    IF current_database() != 'lekalo_test' THEN
        RAISE EXCEPTION 'SAFETY HALT: Execution attempted on database % instead of lekalo_test', current_database();
    END IF;
END
$$;

-- 1. Alter table heights
ALTER TABLE "heights"
ADD COLUMN IF NOT EXISTS "min_height" INTEGER NULL,
ADD COLUMN IF NOT EXISTS "max_height" INTEGER NULL,
ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. Alter table formats
ALTER TABLE "formats"
ADD COLUMN IF NOT EXISTS "max_print_width" INTEGER NULL,
ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 3. Populate existing standard heights
UPDATE "heights" SET "min_height" = 158, "max_height" = 164 WHERE "code" = '158-164' AND "min_height" IS NULL;
UPDATE "heights" SET "min_height" = 164, "max_height" = 170 WHERE "code" = '164-170' AND "min_height" IS NULL;
UPDATE "heights" SET "min_height" = 170, "max_height" = 176 WHERE "code" = '170-176' AND "min_height" IS NULL;

-- 4. Populate existing standard formats
UPDATE "formats" SET "max_print_width" = 210 WHERE "code" = 'A4' AND "max_print_width" IS NULL;
UPDATE "formats" SET "max_print_width" = 900 WHERE "code" = 'PLOTTER_900' AND "max_print_width" IS NULL;
UPDATE "formats" SET "max_print_width" = 216 WHERE "code" = 'LETTER' AND "max_print_width" IS NULL;
